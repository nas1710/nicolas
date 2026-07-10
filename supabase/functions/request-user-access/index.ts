import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const text = (value: unknown) => String(value ?? "").trim();
const json = (body: unknown, headers: Record<string, string>, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...headers, "Content-Type": "application/json" } });

function safeMessage(error: unknown) {
  const message = error instanceof Error ? error.message : "";
  const allowed = ["Ingresa un email valido.", "La contrasena debe tener al menos 8 caracteres.", "Ingresa nombre y apellido.", "Ya existe una solicitud o un usuario con ese email. Consulta al Master.", "Demasiadas solicitudes. Intenta nuevamente mas tarde."];
  return allowed.includes(message) ? message : "No se pudo solicitar el acceso.";
}

Deno.serve(async request => {
  const origins = (Deno.env.get("CORS_ORIGIN") || "https://cardioayala.vercel.app,http://localhost:5173").split(",").map(item => item.trim());
  const origin = request.headers.get("Origin") || "";
  const headers = {
    "Access-Control-Allow-Origin": origins.includes(origin) ? origin : origins[0],
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin"
  };
  if (request.method === "OPTIONS") return new Response("ok", { headers });
  if (request.method !== "POST" || (origin && !origins.includes(origin))) return json({ error: "Solicitud no permitida." }, headers, 403);

  try {
    const url = Deno.env.get("SUPABASE_URL");
    const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!url || !key) throw new Error("Configuracion incompleta.");
    const body = await request.json();
    const email = text(body.email).toLowerCase();
    const password = String(body.password || "");
    const fullName = text(body.full_name);
    if (text(body.website)) return json({ requested: true }, headers);
    if (!email.includes("@")) throw new Error("Ingresa un email valido.");
    if (password.length < 8) throw new Error("La contrasena debe tener al menos 8 caracteres.");
    if (!fullName) throw new Error("Ingresa nombre y apellido.");

    const admin = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
    const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
    const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(forwarded));
    const ipHash = Array.from(new Uint8Array(digest)).map(byte => byte.toString(16).padStart(2, "0")).join("");
    const { count } = await admin.from("audit_logs").select("id", { count: "exact", head: true })
      .eq("action", "USER_ACCESS_REQUEST").eq("after->>ip_hash", ipHash).gte("created_at", new Date(Date.now() - 3600000).toISOString());
    if ((count || 0) >= 5) throw new Error("Demasiadas solicitudes. Intenta nuevamente mas tarde.");

    const { data: list, error: listError } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
    if (listError) throw listError;
    if (list.users.some(user => user.email?.toLowerCase() === email)) throw new Error("Ya existe una solicitud o un usuario con ese email. Consulta al Master.");
    const { data: existingProfile, error: profileLookupError } = await admin
      .from("profiles")
      .select("id")
      .eq("email", email)
      .maybeSingle();
    if (profileLookupError) throw profileLookupError;
    if (existingProfile) throw new Error("Ya existe una solicitud o un usuario con ese email. Consulta al Master.");

    const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { full_name: fullName } });
    if (error || !data.user) throw error || new Error("No se pudo registrar la solicitud.");
    const { error: profileError } = await admin.from("profiles").upsert({ id: data.user.id, email, full_name: fullName, role: "SECRETARIA", location_id: null, active: false, is_master: false, must_change_password: true });
    if (profileError) { await admin.auth.admin.deleteUser(data.user.id); throw profileError; }
    await admin.from("audit_logs").insert({ action: "USER_ACCESS_REQUEST", entity: "profiles", entity_id: data.user.id, after: { ip_hash: ipHash }, user_id: null });
    return json({ requested: true }, headers);
  } catch (error) {
    console.error(error);
    return json({ error: safeMessage(error) }, headers, 400);
  }
});
