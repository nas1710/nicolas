import type { Appointment, Attachment, ClinicalEvolution, OrganizationSettings, Patient, Profile } from "../../api/supabase";
import { createSignedSignatureUrl, organizationLogoUrl } from "../../api/supabase";

export type InstitutionalDocumentKind = "HISTORY" | "MEDICAL_REPORT" | "ATTENDANCE_CERTIFICATE" | "APPOINTMENT_SUMMARY" | "INDICATIONS";

export const documentKindLabels: Record<InstitutionalDocumentKind, string> = {
  HISTORY: "Historia clinica",
  MEDICAL_REPORT: "Informe medico",
  ATTENDANCE_CERTIFICATE: "Constancia de atencion",
  APPOINTMENT_SUMMARY: "Resumen de atencion",
  INDICATIONS: "Indicaciones"
};

type PdfContext = { patient: Patient; profile: Profile; kind: InstitutionalDocumentKind; organization?: OrganizationSettings|null };

export async function printInstitutionalPdf(context: PdfContext) {
  const printWindow = window.open("", "_blank");
  if (!printWindow) throw new Error("El navegador bloqueó la ventana de impresión. Habilitá ventanas emergentes para este sitio.");
  printWindow.document.write("<!doctype html><title>Preparando documento</title><p style='font-family:sans-serif;padding:24px'>Preparando documento para imprimir...</p>");
  try {
    const doc = await buildInstitutionalPdf(context);
    const url = URL.createObjectURL(doc.output("blob"));
    printWindow.location.replace(url);
    window.setTimeout(() => { printWindow.focus(); printWindow.print(); }, 900);
    window.setTimeout(() => URL.revokeObjectURL(url), 120000);
  } catch (error) {
    printWindow.close();
    throw error;
  }
}

export async function buildInstitutionalPdf({ patient, profile, kind, organization }: PdfContext) {
  const { jsPDF } = await import("jspdf");
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4", compress: true });
  const evolutions = sortedEvolutions(patient);
  const latestEvolution = evolutions[evolutions.length - 1];
  const appointments = sortedAppointments(patient);
  const attachments = [...(patient.attachments || [])].sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
  const latestAppointment = appointments[appointments.length - 1];
  const signingProfile = latestEvolution?.author ? { ...profile, ...latestEvolution.author } as Profile : profile;
  const signatureImage = signingProfile.signature_path ? await loadSignatureImage(signingProfile.signature_path).catch(() => null) : null;
  const organizationLogo = organization?.logo_path ? await loadPublicImage(organizationLogoUrl(organization.logo_path)).catch(() => null) : null;
  let y = 0;

  const addPage = () => {
    if (doc.getNumberOfPages() > 0 && y > 0) doc.addPage();
    doc.setFillColor(18, 52, 58);
    doc.rect(0, 0, 210, 28, "F");
    if (organizationLogo) {
      const size = fitImage(doc.getImageProperties(organizationLogo.data), 24, 16);
      doc.addImage(organizationLogo.data, organizationLogo.format, 15, 6, size.width, size.height, undefined, "FAST");
    } else {
      doc.setFillColor(223, 244, 238);
      doc.roundedRect(15, 7, 18, 14, 2, 2, "F");
      doc.setTextColor(7, 91, 76);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(10);
      doc.text("SP", 24, 16, { align: "center" });
    }
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(13);
    doc.text(organization?.commercial_name || profile.institution_name || "Documento asistencial", 39, 13);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8.5);
    doc.text(professionalLine(signingProfile), 39, 19);
    y = 38;
  };

  const ensure = (height: number) => { if (y + height > 277) addPage(); };
  const line = (text: string, options: { bold?: boolean; size?: number; color?: [number, number, number]; gap?: number } = {}) => {
    const size = options.size || 10;
    const wrapped = doc.splitTextToSize(text || "-", 178) as string[];
    const height = wrapped.length * (size * .42) + (options.gap ?? 2);
    ensure(height);
    doc.setFont("helvetica", options.bold ? "bold" : "normal");
    doc.setFontSize(size);
    doc.setTextColor(...(options.color || [31, 45, 51]));
    doc.text(wrapped, 16, y);
    y += height;
  };
  const section = (title: string) => {
    ensure(11);
    y += 3;
    doc.setDrawColor(23, 111, 120);
    doc.setLineWidth(.6);
    doc.line(16, y, 194, y);
    y += 6;
    line(title.toUpperCase(), { bold: true, size: 9, color: [23, 111, 120], gap: 3 });
  };

  addPage();
  line(documentKindLabels[kind], { bold: true, size: 18, color: [15, 36, 42], gap: 5 });
  line(`Fecha de emision: ${formatDate(new Date().toISOString())}`, { size: 8.5, color: [91, 108, 116], gap: 5 });

  doc.setFillColor(241, 246, 247);
  doc.roundedRect(15, y - 1, 180, 28, 2, 2, "F");
  const patientY = y + 5;
  doc.setTextColor(31, 45, 51);
  doc.setFont("helvetica", "bold"); doc.setFontSize(11);
  doc.text(`${patient.last_name}, ${patient.first_name}`, 20, patientY);
  doc.setFont("helvetica", "normal"); doc.setFontSize(8.5);
  doc.text(`Documento: ${patientDocument(patient)}`, 20, patientY + 7);
  doc.text(`Obra social: ${patient.insurance_plans?.name || "No informada"}`, 20, patientY + 13);
  doc.text(`Fecha de nacimiento: ${formatDateOnly(patient.birth_date)}`, 108, patientY + 7);
  doc.text(`Telefono: ${patient.phone || "No informado"}`, 108, patientY + 13);
  y += 34;

  renderDocumentBody(kind, { patient, latestEvolution, latestAppointment, evolutions, appointments, attachments, section, line, reserve: ensure });

  ensure(36);
  y += 10;
  if (signatureImage) {
    const properties = doc.getImageProperties(signatureImage.data);
    const width = Math.min(58, properties.width * 18 / properties.height);
    const height = width * properties.height / properties.width;
    doc.addImage(signatureImage.data, signatureImage.format, 156 - width / 2, y - height - 2, width, height, undefined, "FAST");
  }
  doc.setDrawColor(100, 113, 120);
  doc.line(122, y, 190, y);
  y += 5;
  doc.setFont("helvetica", "bold"); doc.setFontSize(9); doc.setTextColor(31, 45, 51);
  doc.text(signingProfile.signature_name || signingProfile.full_name, 156, y, { align: "center" });
  doc.setFont("helvetica", "normal"); doc.setFontSize(8);
  doc.text(signingProfile.specialty || signingProfile.public_booking_specialty || "Profesional de la salud", 156, y + 5, { align: "center" });
  doc.text(signingProfile.professional_license ? `M.P. ${signingProfile.professional_license.replace(/^M\.?P\.?\s*/i, "")}` : "Matricula no informada", 156, y + 10, { align: "center" });

  const pages = doc.getNumberOfPages();
  for (let page = 1; page <= pages; page += 1) {
    doc.setPage(page);
    doc.setDrawColor(205, 218, 221);
    doc.line(15, 286, 195, 286);
    doc.setFont("helvetica", "normal"); doc.setFontSize(7.5); doc.setTextColor(98, 113, 121);
    doc.text(organization?.legal_text || profile.institutional_footer || "Documento confidencial generado por el sistema de gestion asistencial.", 16, 291);
    doc.text(`Pagina ${page} de ${pages}`, 194, 291, { align: "right" });
  }
  doc.setProperties({ title: `${documentKindLabels[kind]} - ${patient.last_name}, ${patient.first_name}`, author: signingProfile.full_name, subject: documentKindLabels[kind] });
  return doc;
}

function renderDocumentBody(kind: InstitutionalDocumentKind, ctx: {
  patient: Patient;
  latestEvolution?: ClinicalEvolution;
  latestAppointment?: Appointment;
  evolutions: ClinicalEvolution[];
  appointments: Appointment[];
  attachments: Attachment[];
  section: (title: string) => void;
  reserve: (height: number) => void;
  line: (text: string, options?: { bold?: boolean; size?: number; color?: [number, number, number]; gap?: number }) => void;
}) {
  const { latestEvolution, latestAppointment, evolutions, appointments, attachments, section, line, reserve } = ctx;
  if (kind === "ATTENDANCE_CERTIFICATE") {
    section("Constancia");
    line(`Se deja constancia que ${ctx.patient.first_name} ${ctx.patient.last_name} fue atendido/a el ${formatDate(latestAppointment?.starts_at || latestEvolution?.occurred_at || new Date().toISOString())}.`);
    line(`Centro de atencion: ${latestAppointment?.locations?.name || "No informado"}.`);
    return;
  }
  if (kind === "APPOINTMENT_SUMMARY") {
    section("Atencion");
    line(`Fecha: ${formatDate(latestAppointment?.starts_at || latestEvolution?.occurred_at || new Date().toISOString())}`);
    line(`Practica o motivo: ${cleanAppointmentReason(latestAppointment) || latestEvolution?.reason || "Consulta"}`);
    line(`Consultorio: ${latestAppointment?.locations?.name || "No informado"}`);
    if (latestEvolution?.diagnosis) { section("Diagnostico"); line(latestEvolution.diagnosis); }
    if (latestEvolution?.notes) { section("Resumen"); line(latestEvolution.notes); }
    return;
  }
  if (kind === "INDICATIONS") {
    section("Indicaciones para el paciente");
    line(latestEvolution?.indications || "No se registraron indicaciones para la ultima atencion.");
    if (latestEvolution?.next_visit_at) line(`Proximo control orientativo: ${formatDate(latestEvolution.next_visit_at)}`, { bold: true });
    return;
  }
  if (kind === "MEDICAL_REPORT") {
    section(latestEvolution?.reason || "Informe");
    if (latestEvolution?.diagnosis) { line("Diagnostico", { bold: true }); line(latestEvolution.diagnosis); }
    line(latestEvolution?.notes || "No se registro contenido clinico para la ultima evolucion.");
    if (latestEvolution?.indications) { section("Indicaciones"); line(latestEvolution.indications); }
    return;
  }
  section("Linea de tiempo clinica");
  const events = clinicalTimelineEvents(evolutions, appointments, attachments);
  if (!events.length) line("Sin atenciones ni documentos registrados.", { color: [91, 108, 116] });
  events.forEach(event => {
    reserve(30);
    line(`${formatDate(event.date)} - ${event.title}`, { bold: true, color: event.color, gap: 2 });
    event.lines.forEach(value => line(value));
    line("", { gap: 3 });
  });
}

function clinicalTimelineEvents(evolutions: ClinicalEvolution[], appointments: Appointment[], attachments: Attachment[]) {
  const evolutionEvents = evolutions.map(evolution => ({
    date: evolution.occurred_at,
    title: evolution.reason || "Consulta / evolucion",
    color: [15, 92, 96] as [number, number, number],
    lines: [
      evolution.author ? `Profesional: ${evolution.author.full_name}${evolution.author.specialty || evolution.author.public_booking_specialty ? ` - ${evolution.author.specialty || evolution.author.public_booking_specialty}` : ""}${evolution.author.professional_license ? ` - M.P. ${evolution.author.professional_license.replace(/^M\.?P\.?\s*/i, "")}` : ""}` : "",
      evolution.diagnosis ? `Diagnostico: ${evolution.diagnosis}` : "",
      evolution.notes ? `Evolucion: ${evolution.notes}` : "",
      evolution.indications ? `Indicaciones: ${evolution.indications}` : "",
      evolution.requested_studies ? `Estudios solicitados: ${evolution.requested_studies}` : "",
      evolution.next_visit_at ? `Proximo control: ${formatDate(evolution.next_visit_at)}` : ""
    ].filter(Boolean)
  }));
  const appointmentEvents = appointments
    .filter(appointment => new Date(appointment.starts_at).getTime() <= Date.now())
    .map(appointment => ({
      date: appointment.starts_at,
      title: cleanAppointmentReason(appointment) || "Atencion programada",
      color: [82, 96, 103] as [number, number, number],
      lines: [`Estado: ${appointment.status.replace(/_/g, " ")}`, appointment.locations?.name ? `Centro: ${appointment.locations.name}` : ""].filter(Boolean)
    }));
  const attachmentEvents = attachments.map(attachment => ({
    date: attachment.created_at,
    title: `Documento: ${attachment.file_name}`,
    color: [114, 74, 170] as [number, number, number],
    lines: [attachment.description || "", `Tipo: ${attachment.kind.replace(/_/g, " ")}`].filter(Boolean)
  }));
  return [...evolutionEvents, ...appointmentEvents, ...attachmentEvents]
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
}

function professionalLine(profile: Profile) {
  const specialty = profile.specialty || profile.public_booking_specialty || "Profesional de la salud";
  return `${profile.full_name} - ${specialty}${profile.professional_license ? ` - Matricula ${profile.professional_license}` : ""}`;
}
function patientDocument(patient: Patient) { return `${patient.document_type || "Documento"} ${patient.document || "No informado"}`; }
function sortedEvolutions(patient: Patient) { return [...(patient.clinical_evolutions || [])].sort((a, b) => new Date(a.occurred_at).getTime() - new Date(b.occurred_at).getTime()); }
function sortedAppointments(patient: Patient) { return [...(patient.appointments || [])].filter(item => item.status !== "CANCELADO").sort((a, b) => new Date(a.starts_at).getTime() - new Date(b.starts_at).getTime()); }
function formatDate(value?: string | null) { return value ? new Date(value).toLocaleString("es-AR", { timeZone: "America/Argentina/Buenos_Aires", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "No informada"; }
function formatDateOnly(value?: string | null) { if (!value) return "No informada"; const [year, month, day] = value.slice(0, 10).split("-"); return `${day}/${month}/${year}`; }
function cleanAppointmentReason(appointment?: Appointment) { return appointment?.reason?.replace(/\[\[MOTIVOS_TURNO:[^\]]+\]\]/g, "").trim() || appointment?.type?.replace(/_/g, " ") || ""; }
async function loadSignatureImage(path: string) {
  const url = await createSignedSignatureUrl(path);
  const response = await fetch(url);
  if (!response.ok) throw new Error("No se pudo cargar la firma.");
  const blob = await response.blob();
  const data = await new Promise<string>((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.onerror = () => reject(reader.error); reader.readAsDataURL(blob); });
  return { data, format: blob.type === "image/png" ? "PNG" : blob.type === "image/webp" ? "WEBP" : "JPEG" };
}

async function loadPublicImage(url: string) {
  const response = await fetch(url);
  if (!response.ok) throw new Error("No se pudo cargar el logo institucional.");
  const blob = await response.blob();
  const data = await blobToDataUrl(blob);
  return { data, format: imageFormat(blob.type) };
}

function blobToDataUrl(blob: Blob) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

function imageFormat(type: string) { return type === "image/png" ? "PNG" : type === "image/webp" ? "WEBP" : "JPEG"; }
function fitImage(properties: { width: number; height: number }, maxWidth: number, maxHeight: number) {
  const ratio = Math.min(maxWidth / properties.width, maxHeight / properties.height);
  return { width: properties.width * ratio, height: properties.height * ratio };
}
