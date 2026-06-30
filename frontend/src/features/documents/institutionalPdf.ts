import type { Appointment, ClinicalEvolution, Patient, Profile } from "../../api/supabase";
import { createSignedSignatureUrl } from "../../api/supabase";

export type InstitutionalDocumentKind = "HISTORY" | "MEDICAL_REPORT" | "ATTENDANCE_CERTIFICATE" | "APPOINTMENT_SUMMARY" | "INDICATIONS";

export const documentKindLabels: Record<InstitutionalDocumentKind, string> = {
  HISTORY: "Historia clinica",
  MEDICAL_REPORT: "Informe medico",
  ATTENDANCE_CERTIFICATE: "Constancia de atencion",
  APPOINTMENT_SUMMARY: "Resumen de atencion",
  INDICATIONS: "Indicaciones"
};

type PdfContext = { patient: Patient; profile: Profile; kind: InstitutionalDocumentKind };

export async function downloadInstitutionalPdf(context: PdfContext) {
  const doc = await buildInstitutionalPdf(context);
  doc.save(institutionalPdfFileName(context.patient, context.kind));
}

export async function buildInstitutionalPdf({ patient, profile, kind }: PdfContext) {
  const { jsPDF } = await import("jspdf");
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4", compress: true });
  const evolutions = sortedEvolutions(patient);
  const latestEvolution = evolutions[evolutions.length - 1];
  const appointments = sortedAppointments(patient);
  const latestAppointment = appointments[appointments.length - 1];
  const signatureImage = profile.signature_path ? await loadSignatureImage(profile.signature_path).catch(() => null) : null;
  let y = 0;

  const addPage = () => {
    if (doc.getNumberOfPages() > 0 && y > 0) doc.addPage();
    doc.setFillColor(18, 52, 58);
    doc.rect(0, 0, 210, 28, "F");
    doc.setFillColor(223, 244, 238);
    doc.roundedRect(15, 7, 18, 14, 2, 2, "F");
    doc.setTextColor(7, 91, 76);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.text("SP", 24, 16, { align: "center" });
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(13);
    doc.text(profile.institution_name || "Documento asistencial", 39, 13);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8.5);
    doc.text(professionalLine(profile), 39, 19);
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

  renderDocumentBody(kind, { patient, latestEvolution, latestAppointment, evolutions, section, line, reserve: ensure });

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
  doc.text(profile.signature_name || profile.full_name, 156, y, { align: "center" });
  doc.setFont("helvetica", "normal"); doc.setFontSize(8);
  doc.text(profile.specialty || profile.public_booking_specialty || "Profesional de la salud", 156, y + 5, { align: "center" });
  doc.text(profile.professional_license ? `M.P. ${profile.professional_license.replace(/^M\.?P\.?\s*/i, "")}` : "Matricula no informada", 156, y + 10, { align: "center" });

  const pages = doc.getNumberOfPages();
  for (let page = 1; page <= pages; page += 1) {
    doc.setPage(page);
    doc.setDrawColor(205, 218, 221);
    doc.line(15, 286, 195, 286);
    doc.setFont("helvetica", "normal"); doc.setFontSize(7.5); doc.setTextColor(98, 113, 121);
    doc.text(profile.institutional_footer || "Documento confidencial generado por el sistema de gestion asistencial.", 16, 291);
    doc.text(`Pagina ${page} de ${pages}`, 194, 291, { align: "right" });
  }
  doc.setProperties({ title: `${documentKindLabels[kind]} - ${patient.last_name}, ${patient.first_name}`, author: profile.full_name, subject: documentKindLabels[kind] });
  return doc;
}

function renderDocumentBody(kind: InstitutionalDocumentKind, ctx: {
  patient: Patient;
  latestEvolution?: ClinicalEvolution;
  latestAppointment?: Appointment;
  evolutions: ClinicalEvolution[];
  section: (title: string) => void;
  reserve: (height: number) => void;
  line: (text: string, options?: { bold?: boolean; size?: number; color?: [number, number, number]; gap?: number }) => void;
}) {
  const { latestEvolution, latestAppointment, evolutions, section, line, reserve } = ctx;
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
  section("Evoluciones clinicas");
  if (!evolutions.length) line("Sin evoluciones clinicas registradas.", { color: [91, 108, 116] });
  evolutions.forEach(evolution => {
    reserve(44);
    line(`${formatDate(evolution.occurred_at)} - ${evolution.reason}`, { bold: true, color: [15, 92, 96], gap: 2 });
    if (evolution.diagnosis) line(`Diagnostico: ${evolution.diagnosis}`);
    if (evolution.notes) line(`Evolucion: ${evolution.notes}`);
    if (evolution.indications) line(`Indicaciones: ${evolution.indications}`);
    if (evolution.next_visit_at) line(`Proximo control: ${formatDate(evolution.next_visit_at)}`, { gap: 5 });
  });
}

export function institutionalPdfFileName(patient: Patient, kind: InstitutionalDocumentKind) {
  const date = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Argentina/Buenos_Aires" }).format(new Date());
  return `${sanitize(`${patient.last_name}_${patient.first_name}`)}_${sanitize(documentKindLabels[kind])}_${date}.pdf`;
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
function sanitize(value: string) { return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-zA-Z0-9_-]+/g, "_").replace(/_+/g, "_").replace(/^_|_$/g, ""); }

async function loadSignatureImage(path: string) {
  const url = await createSignedSignatureUrl(path);
  const response = await fetch(url);
  if (!response.ok) throw new Error("No se pudo cargar la firma.");
  const blob = await response.blob();
  const data = await new Promise<string>((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.onerror = () => reject(reader.error); reader.readAsDataURL(blob); });
  return { data, format: blob.type === "image/png" ? "PNG" : blob.type === "image/webp" ? "WEBP" : "JPEG" };
}
