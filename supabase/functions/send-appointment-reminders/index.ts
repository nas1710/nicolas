import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

type ReminderChannel = "EMAIL" | "WHATSAPP";

function response(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

function cleanPhone(value: string | null | undefined) {
  return String(value || "").replace(/\D/g, "");
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" }[char] || char));
}

function appointmentText(appointment: any) {
  const starts = new Date(appointment.starts_at);
  const patientName = `${appointment.patients.first_name} ${appointment.patients.last_name}`.trim();
  const professionalName = appointment.doctor?.full_name || "el profesional";
  const date = starts.toLocaleDateString("es-AR", { timeZone: "America/Argentina/Buenos_Aires", weekday: "long", day: "2-digit", month: "long" });
  const time = starts.toLocaleTimeString("es-AR", { timeZone: "America/Argentina/Buenos_Aires", hour: "2-digit", minute: "2-digit" });
  const location = appointment.locations?.name || "el consultorio";
  return { patientName, professionalName, date, time, location, text: `Hola ${patientName}, te recordamos tu turno con ${professionalName} el ${date} a las ${time} en ${location}.` };
}

async function sendEmail(to: string, details: ReturnType<typeof appointmentText>) {
  const apiKey = Deno.env.get("RESEND_API_KEY");
  const from = Deno.env.get("REMINDER_EMAIL_FROM");
  if (!apiKey || !from) throw new Error("Proveedor de email no configurado.");
  const result = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from,
      to: [to],
      subject: `Recordatorio de turno - ${details.date}`,
      html: `<p>${escapeHtml(details.text)}</p><p>Si no podés asistir, comunicate con el consultorio.</p>`
    })
  });
  const payload = await result.json();
  if (!result.ok) throw new Error(payload?.message || "El proveedor de email rechazo el envio.");
  return String(payload.id || "");
}

async function sendWhatsApp(to: string, details: ReturnType<typeof appointmentText>) {
  const token = Deno.env.get("WHATSAPP_ACCESS_TOKEN");
  const phoneNumberId = Deno.env.get("WHATSAPP_PHONE_NUMBER_ID");
  const template = Deno.env.get("WHATSAPP_TEMPLATE_NAME");
  const graphVersion = Deno.env.get("WHATSAPP_GRAPH_VERSION") || "v23.0";
  if (!token || !phoneNumberId || !template) throw new Error("Proveedor de WhatsApp no configurado.");
  const result = await fetch(`https://graph.facebook.com/${graphVersion}/${phoneNumberId}/messages`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      to,
      type: "template",
      template: {
        name: template,
        language: { code: Deno.env.get("WHATSAPP_TEMPLATE_LANGUAGE") || "es_AR" },
        components: [{ type: "body", parameters: [details.patientName, details.professionalName, details.date, details.time, details.location].map(text => ({ type: "text", text })) }]
      }
    })
  });
  const payload = await result.json();
  if (!result.ok) throw new Error(payload?.error?.message || "WhatsApp rechazo el envio.");
  return String(payload?.messages?.[0]?.id || "");
}

Deno.serve(async request => {
  if (request.method !== "POST") return response({ error: "Metodo no permitido." }, 405);
  const cronSecret = Deno.env.get("REMINDER_CRON_SECRET");
  if (!cronSecret || request.headers.get("x-cron-secret") !== cronSecret) return response({ error: "Acceso no autorizado." }, 401);

  const url = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !serviceKey) return response({ error: "Configuracion incompleta." }, 500);
  const admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const now = Date.now();
  const from = new Date(now + 23 * 60 * 60 * 1000).toISOString();
  const to = new Date(now + 25 * 60 * 60 * 1000).toISOString();
  const { data: appointments, error } = await admin.from("appointments")
    .select("id,patient_id,doctor_id,organization_id,starts_at,status,patients(first_name,last_name,email,phone),doctor:profiles!appointments_doctor_id_fkey(full_name),locations(name)")
    .in("status", ["CONFIRMADO", "PENDIENTE"])
    .gte("starts_at", from).lt("starts_at", to);
  if (error) return response({ error: error.message }, 500);

  const results: Array<Record<string, unknown>> = [];
  for (const appointment of appointments || []) {
    const patient = Array.isArray(appointment.patients) ? appointment.patients[0] : appointment.patients;
    if (!patient) continue;
    const details = appointmentText({ ...appointment, patients: patient, doctor: Array.isArray(appointment.doctor) ? appointment.doctor[0] : appointment.doctor, locations: Array.isArray(appointment.locations) ? appointment.locations[0] : appointment.locations });
    const channels: Array<{ channel: ReminderChannel; destination: string }> = [];
    if (patient.email) channels.push({ channel: "EMAIL", destination: patient.email });
    const phone = cleanPhone(patient.phone);
    if (phone) channels.push({ channel: "WHATSAPP", destination: phone });

    let sent = 0;
    for (const item of channels) {
      const { data: existing } = await admin.from("appointment_reminders").select("id,status,attempts").eq("appointment_id", appointment.id).eq("channel", item.channel).maybeSingle();
      if (existing?.status === "SENT") continue;
      const reminder = existing || (await admin.from("appointment_reminders").insert({ appointment_id: appointment.id, patient_id: appointment.patient_id, organization_id: appointment.organization_id, channel: item.channel, scheduled_for: new Date(new Date(appointment.starts_at).getTime() - 24 * 60 * 60 * 1000).toISOString() }).select("id,status,attempts").single()).data;
      if (!reminder) continue;
      try {
        await admin.from("appointment_reminders").update({ status: "PROCESSING", updated_at: new Date().toISOString() }).eq("id", reminder.id);
        const providerId = item.channel === "EMAIL" ? await sendEmail(item.destination, details) : await sendWhatsApp(item.destination, details);
        await admin.from("appointment_reminders").update({ status: "SENT", sent_at: new Date().toISOString(), provider_message_id: providerId, last_error: null, attempts: (reminder.attempts || 0) + 1, updated_at: new Date().toISOString() }).eq("id", reminder.id);
        await admin.from("communications").insert({ patient_id: appointment.patient_id, appointment_id: appointment.id, professional_id: appointment.doctor_id, channel: item.channel, kind: "APPOINTMENT_REMINDER", subject: item.channel === "EMAIL" ? `Recordatorio de turno - ${details.date}` : "", body: details.text, status: "ENVIADO_AUTOMATICO", sent_at: new Date().toISOString() });
        sent++;
      } catch (sendError) {
        const message = sendError instanceof Error ? sendError.message : "No se pudo enviar.";
        const providerMissing = message.includes("no configurado");
        await admin.from("appointment_reminders").update({ status: providerMissing ? "PENDING" : (reminder.attempts || 0) >= 2 ? "FAILED" : "PENDING", last_error: message, attempts: providerMissing ? reminder.attempts || 0 : (reminder.attempts || 0) + 1, updated_at: new Date().toISOString() }).eq("id", reminder.id);
        results.push({ appointment_id: appointment.id, channel: item.channel, error: message });
      }
    }
    if (sent > 0) await admin.from("appointments").update({ status: "RECORDATORIO_ENVIADO", updated_at: new Date().toISOString() }).eq("id", appointment.id);
  }
  return response({ processed: appointments?.length || 0, results });
});
