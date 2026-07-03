import { createClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error("Faltan VITE_SUPABASE_URL o VITE_SUPABASE_ANON_KEY");
}

const rememberSessionKey = "seguimiento-pacientes-remember-session";

export function getRememberSessionPreference() {
  return window.localStorage.getItem(rememberSessionKey) !== "false";
}

export function setRememberSessionPreference(remember: boolean) {
  window.localStorage.setItem(rememberSessionKey, String(remember));
}

const authStorage = {
  getItem(key: string) {
    return window.localStorage.getItem(key) ?? window.sessionStorage.getItem(key);
  },
  setItem(key: string, value: string) {
    if (getRememberSessionPreference()) {
      window.localStorage.setItem(key, value);
      window.sessionStorage.removeItem(key);
    } else {
      window.sessionStorage.setItem(key, value);
      window.localStorage.removeItem(key);
    }
  },
  removeItem(key: string) {
    window.localStorage.removeItem(key);
    window.sessionStorage.removeItem(key);
  }
};

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    storage: authStorage
  }
});

export type Role = "MEDICA_ADMIN" | "ADMINISTRADOR" | "MEDICO" | "SECRETARIA";
export type IdentityDocumentType = "DNI" | "LC" | "LE" | "PASAPORTE" | "CEDULA_IDENTIDAD" | "DOCUMENTO_EXTRANJERO";

export type Location = {
  id: string;
  name: string;
  address: string | null;
  active: boolean;
};

export type Profile = {
  id: string;
  email: string;
  full_name: string;
  role: Role;
  location_id: string | null;
  active: boolean;
  is_master: boolean;
  must_change_password: boolean;
  document_number: string | null;
  specialty?: string | null;
  public_booking_specialty?: string | null;
  professional_license?: string | null;
  signature_name?: string | null;
  institution_name?: string | null;
  institutional_footer?: string | null;
  signature_path?: string | null;
  organization_id?: string | null;
  organization?: { id:string; commercial_name:string; commercial_status:string; active:boolean } | null;
  location?: Location | null;
  simulated?: boolean;
  simulated_professional_id?: string | null;
};

export type InsurancePlan = {
  id: string;
  name: string;
  active: boolean;
};

export type MedicalAvailability = {
  id: string;
  weekday: number;
  enabled: boolean;
  start_time: string;
  end_time: string;
  slot_interval_min: number;
  location_id: string;
  doctor_id: string | null;
  locations?: Location | null;
  doctor?: Pick<Profile, "id" | "full_name" | "specialty" | "professional_license"> | null;
};

export type PublicBookingDoctor = {
  id: string;
  full_name: string;
  specialty: string;
};

export type PublicSpecialty = { id: string; name: string; description: string | null };
export type PublicPractice = { id: string; specialty_id: string; name: string; description: string | null; duration_min: number; requires_preparation?: boolean; preparation_instructions?: string | null };
export type PublicProfessional = { id: string; full_name: string; specialty: string; specialty_ids: string[]; practice_ids: string[] };
export type PublicLocation = { id: string; name: string; address: string | null };
export type PublicCommercialCatalog = { specialties: PublicSpecialty[]; practices: PublicPractice[]; professionals: PublicProfessional[]; locations: PublicLocation[] };
export type CommercialSpecialty = PublicSpecialty & { active: boolean; published: boolean };
export type CommercialPractice = PublicPractice & { active: boolean; published: boolean };
export type CommercialProfessional = { id: string; full_name: string; public_booking_enabled: boolean; specialty_ids: string[]; practice_ids: string[]; specialty?: string | null; professional_license?: string | null };
export type CommercialAdminCatalog = { specialties: CommercialSpecialty[]; practices: CommercialPractice[]; professionals: CommercialProfessional[] };
export type OrganizationSettings = {
  id: string; slug?: string | null; commercial_name: string; legal_name?: string | null; tax_id?: string | null; description?: string | null;
  logo_path?: string | null; primary_color: string; secondary_color: string; phone?: string | null; whatsapp?: string | null;
  email?: string | null; main_address?: string | null; social_links?: Record<string,string>; welcome_title?: string | null;
  welcome_text?: string | null; legal_text?: string | null; booking_terms?: string | null; insurance_information?: string | null;
  public_notice?: string | null; centers?: Array<{id:string;name:string;address?:string|null;phone?:string|null;email?:string|null}>;
  insurance_plans?: Array<{id:string;name:string}>;
};
export type OrganizationCenter = { id:string; organization_id:string; name:string; address:string|null; phone:string|null; email:string|null; active:boolean; published:boolean };
export type OrganizationSummary = { id:string; commercial_name:string; active:boolean };
export type CommercialPlan = { id:string; name:string; description:string|null; monthly_price:number|null; currency:"ARS"|"USD"; support_description:string|null; max_professionals:number|null; max_centers:number|null; max_internal_users:number|null; max_monthly_appointments:number|null; patient_portal_enabled:boolean; institutional_pdf_enabled:boolean; communications_enabled:boolean; advanced_dashboard_enabled:boolean; active:boolean };
export type CommercialPayment = { id:string; paid_on:string; period_from:string|null; period_to:string|null; amount:number; currency:"ARS"|"USD"; payment_method:string|null; reference:string|null; notes:string|null; status:"REGISTRADO"|"ANULADO"; created_at:string };
export type CommercialHistory = { id:number; event_type:string; notes:string|null; new_data:Record<string,unknown>|null; created_at:string };
export type CommercialOrganization = OrganizationSettings & { slug:string; commercial_status:"CONFIGURACION"|"ACTIVA"|"SUSPENDIDA"|"BAJA"; responsible_name?:string|null; responsible_email?:string|null; responsible_phone?:string|null; commercial_notes?:string|null; subscription_id:string|null; plan_id:string|null; starts_on:string|null; renews_on:string|null; expires_on:string|null; subscription_status:string|null; subscription_notes:string|null; agreed_amount:number|null; currency:"ARS"|"USD"; payment_method:string|null; commercial_manager:string|null; billing_day:number|null; days_remaining:number|null; payments:CommercialPayment[]; commercial_history:CommercialHistory[]; users_count:number; professionals_count:number; centers_count:number; administrators_count:number };
export type OrganizationCommercialCatalog = { plans:CommercialPlan[]; organizations:CommercialOrganization[] };
export type OrganizationCommercialAccount = { organization_id:string; organization_name:string; commercial_status:string; plan_name:string|null; subscription_status:string|null; starts_on:string|null; renews_on:string|null; expires_on:string|null; days_remaining:number|null; agreed_amount:number|null; currency:"ARS"|"USD"; payment_method:string|null; commercial_manager:string|null };
export type DashboardMetric = { label: string; value: number };
export type DashboardFilters = { from: string; to: string; professional_id?: string; specialty_id?: string; practice_id?: string; location_id?: string; status?: string; source?: string; validation_status?: string };
export type DashboardReport = {
  summary: { total: number; pending: number; confirmed: number; cancelled: number; attended: number; webAppointments: number; internalAppointments: number; newPatients: number; webPatients: number; pendingValidation: number; archivedValidation: number; capacity: number; occupancy: number };
  byProfessional: DashboardMetric[]; byLocation: DashboardMetric[]; byPractice: DashboardMetric[]; bySpecialty: DashboardMetric[]; byHour: DashboardMetric[];
  appointments: Array<{ id: string; starts_at: string; duration_min: number; status: string; source: string; professional_name: string; location_name: string; patient_first_name: string; patient_last_name: string }>;
  patients: Array<{ id: string; first_name: string; last_name: string; source: string; validation_status: string; created_at: string }>;
  options: { professionals: Array<{ id: string; name: string }>; locations: Array<{ id: string; name: string }>; specialties: Array<{ id: string; name: string }>; practices: Array<{ id: string; name: string; specialty_id: string }> };
};

export type PublicBookingSlot = {
  starts_at: string;
  location_id: string;
  location_name: string;
  location_address: string | null;
};

export type PublicBookingSearchSlot = PublicBookingSlot & {
  doctor_id: string;
  doctor_name: string;
  specialty_name: string;
};

export type PublicBookingDate = {
  date: string;
  available_count: number;
};

export type BuenosAiresClock = {
  now: string;
  local_date: string;
  timezone: "America/Argentina/Buenos_Aires";
};

export type PublicBookingInput = {
  doctor_id: string;
  starts_at: string;
  types: string[];
  first_name: string;
  last_name: string;
  document_type: IdentityDocumentType;
  document: string;
  phone?: string;
  email?: string;
  insurance_plan_id?: string;
  website?: string;
};

export type CatalogBookingInput = Omit<PublicBookingInput, "types"> & { practice_ids: string[] };

export type PublicBookingResult = {
  appointment_id: string;
  starts_at: string;
  duration_min: number;
  doctor_name: string;
  location_name: string;
  location_address: string | null;
  status: "PENDIENTE";
};

export type Holiday = {
  id: string;
  date: string;
  name: string;
  kind: "FERIADO" | "VACACIONES" | "CONGRESO" | "LICENCIA" | "OTRO";
  active: boolean;
  doctor_id?: string | null;
};

export type Patient = {
  id: string;
  first_name: string;
  last_name: string;
  document_type: IdentityDocumentType;
  document: string | null;
  birth_date: string | null;
  phone: string | null;
  email: string | null;
  status: string;
  source?: "INTERNAL" | "WEB";
  validation_status?: "PENDIENTE" | "VALIDADO" | "ARCHIVADO_NO_VALIDADO";
  affiliate_number: string | null;
  documentation_pending?: boolean;
  documentation_note?: string | null;
  insurance_plan_id: string | null;
  insurance_plans?: InsurancePlan | null;
  patient_locations?: Array<{ location_id: string; locations?: Location | null }>;
  linked_existing?: boolean;
  appointments?: Appointment[];
  studies?: Study[];
  administrative_notes?: AdministrativeNote[];
  clinical_evolutions?: ClinicalEvolution[];
  communications?: Communication[];
  attachments?: Attachment[];
};

export type Appointment = {
  id: string;
  starts_at: string;
  duration_min: number;
  type: string;
  reason: string | null;
  status: AppointmentStatus;
  patient_id: string;
  location_id: string;
  doctor_id?: string | null;
  patients?: Patient | null;
  locations?: Location | null;
  doctor?: Pick<Profile, "id" | "full_name" | "specialty"> | null;
  appointment_practices?: Array<{ practices?: { name: string; preparation_instructions?: string | null } | null }>;
  communications?: Array<Pick<Communication,"status"|"channel"|"created_at">>;
};

export type AppointmentStatus = "PENDIENTE" | "CONFIRMADO" | "RECORDATORIO_ENVIADO" | "CANCELADO" | "AUSENTE";

export type Study = {
  id: string;
  type: string;
  performed_at: string | null;
  indication: string | null;
  conclusion: string | null;
  status: string;
  patient_id: string;
  patients?: Patient | null;
};

export type Report = {
  id: string;
  file_name: string;
  source: string;
  status: string;
  location_id: string | null;
  patient_id: string | null;
  study_id: string | null;
};

export type AdministrativeNote = {
  id: string;
  text: string;
  created_at: string;
};

export type ClinicalEvolution = {
  id: string;
  occurred_at: string;
  reason: string;
  diagnosis: string | null;
  notes: string | null;
  indications: string | null;
  requested_studies?: string | null;
  next_visit_at: string | null;
  created_by?: string;
  author?: Pick<Profile, "id" | "full_name" | "specialty" | "public_booking_specialty" | "professional_license" | "signature_name" | "signature_path" | "institution_name" | "institutional_footer"> | null;
};

export type Communication = {
  id: string;
  channel: "WHATSAPP" | "EMAIL" | "PHONE";
  subject: string;
  body: string;
  sent_at: string;
  created_at?: string;
  appointment_id?: string | null;
  professional_id?: string | null;
  kind?: string;
  status?: "PREPARADO" | "ENVIADO_MANUAL" | "CONTACTADO" | "SIN_RESPUESTA" | "FALLIDO";
  observation?: string | null;
};
export type CommunicationTemplate = { id:string;name:string;kind:string;channel:"WHATSAPP"|"EMAIL"|"PHONE";subject:string;body:string;active:boolean };
export type CommunicationAlert = { kind:string;appointment_id:string|null;patient_id:string;title:string;due_at:string|null;detail:string };
export type ProfessionalSecretaryAssignment = { professional_id:string; secretary_id:string; active:boolean };
export type AuditLog = {
  id: string;
  action: string;
  entity: string;
  entity_id: string | null;
  user_id: string | null;
  created_at: string;
  after: Record<string, unknown> | null;
  actor?: { full_name: string; role: Role } | null;
};

export type Attachment = {
  id: string;
  patient_id: string;
  study_id: string | null;
  file_name: string;
  storage_path: string | null;
  external_url: string | null;
  storage_provider: "SUPABASE" | "GOOGLE_DRIVE";
  mime_type: string | null;
  size_bytes: number | null;
  origin: "PACIENTE" | "MEDICA" | "CARDIOVEX" | "ECCOSUR" | "OTRO";
  kind: "ESTUDIO_PREVIO" | "INFORME_PROPIO" | "ORDEN_MEDICA" | "IMAGEN" | "VIDEO" | "OTRO";
  description: string | null;
  pending_send: boolean;
  created_at: string;
  patients?: Patient | null;
};

export type PatientInput = {
  first_name: string;
  last_name: string;
  document_type?: IdentityDocumentType;
  document?: string;
  birth_date?: string;
  phone?: string;
  email?: string;
  affiliate_number?: string;
  insurance_plan_id?: string;
  location_id?: string;
};

export type PatientContactInput = {
  phone?: string;
  email?: string;
  affiliate_number?: string;
  insurance_plan_id?: string;
  documentation_pending?: boolean;
  documentation_note?: string;
};

export type ClinicalEvolutionInput = {
  patient_id: string;
  occurred_at: string;
  reason: string;
  diagnosis?: string;
  notes?: string;
  indications?: string;
  requested_studies?: string;
  next_visit_at?: string;
};

export type AdministrativeNoteInput = {
  patient_id: string;
  text: string;
};

export type AppointmentInput = {
  starts_at: string;
  duration_min: number;
  type: string;
  reason?: string;
  patient_id: string;
  location_id: string;
  doctor_id?: string | null;
};

export type AppointmentUpdateInput = Partial<AppointmentInput> & {
  status?: AppointmentStatus;
};

export type LocationInput = {
  name: string;
  address?: string;
  active?: boolean;
};

export type InsurancePlanInput = {
  name: string;
  active?: boolean;
};

export type MedicalAvailabilityInput = {
  weekday: number;
  enabled: boolean;
  start_time: string;
  end_time: string;
  slot_interval_min: number;
  location_id: string;
  doctor_id?: string | null;
};

export type ProfileInput = {
  id: string;
  email: string;
  full_name: string;
  role: Role;
  location_id?: string | null;
  active: boolean;
  document_number?: string | null;
  organization_id?: string | null;
};

export type NewUserInput = {
  email: string;
  password: string;
  full_name: string;
  role: Role;
  location_id?: string | null;
  document_number?: string | null;
  organization_id?: string | null;
};

function throwIfError(error: { message: string } | null) {
  if (error) throw new Error(error.message);
}

function authErrorMessage(error: { message: string; code?: string } | null) {
  if (!error) return "No se pudo iniciar sesion.";

  switch (error.code) {
    case "invalid_credentials":
      return "Email o contrasena incorrectos.";
    case "email_not_confirmed":
      return "La cuenta todavia no fue habilitada. Pedi al Master que la active desde Usuarios.";
    case "user_banned":
      return "Este usuario esta deshabilitado. Consulta con la medica/admin.";
    case "weak_password":
      return "La contrasena es demasiado debil. Usa al menos 8 caracteres y evita datos personales.";
    case "over_request_rate_limit":
    case "over_email_send_rate_limit":
      return "Hubo demasiados intentos. Espera unos minutos y volve a probar.";
    default:
      return error.message || "No se pudo iniciar sesion.";
  }
}

function toIsoDateTime(value?: string | null) {
  if (!value) return null;
  const buenosAiresValue = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value) ? `${value}:00-03:00` : value;
  return new Date(buenosAiresValue).toISOString();
}

export function parseBirthDate(value?: string | null) {
  if (!value) return null;
  const rawValue = value.trim();
  const cleanValue = /^\d{8}$/.test(rawValue) ? formatBirthDateInput(rawValue) : rawValue;
  const displayMatch = cleanValue.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  const isoMatch = cleanValue.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!displayMatch && !isoMatch) throw new Error("La fecha de nacimiento debe tener formato dd/mm/yyyy.");

  const dayText = displayMatch?.[1] || isoMatch?.[3] || "";
  const monthText = displayMatch?.[2] || isoMatch?.[2] || "";
  const yearText = displayMatch?.[3] || isoMatch?.[1] || "";
  const day = Number(dayText);
  const month = Number(monthText);
  const year = Number(yearText);
  const date = new Date(year, month - 1, day);
  const today = new Date();

  if (
    year < 1900
    || year > today.getFullYear()
    || date > today
    || date.getFullYear() !== year
    || date.getMonth() !== month - 1
    || date.getDate() !== day
  ) {
    throw new Error("La fecha de nacimiento no es valida.");
  }

  return `${yearText}-${monthText}-${dayText}`;
}

export function formatBirthDateInput(value?: string | null) {
  const digits = String(value || "").replace(/\D/g, "").slice(0, 8);
  if (digits.length <= 2) return digits;
  if (digits.length <= 4) return `${digits.slice(0, 2)}/${digits.slice(2)}`;
  return `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4)}`;
}

export function formatProperName(value?: string | null) {
  const connectors = new Set(["de", "del", "la", "las", "los", "y", "e"]);
  return (value || "")
    .trim()
    .replace(/\s+/g, " ")
    .split(" ")
    .map((word, index) => {
      const lower = word.toLocaleLowerCase("es-AR");
      if (index > 0 && connectors.has(lower)) return lower;
      return lower.replace(/(^|[-'])([a-z\u00e1\u00e9\u00ed\u00f3\u00fa\u00fc\u00f1])/g, (_match, prefix: string, letter: string) => (
        `${prefix}${letter.toLocaleUpperCase("es-AR")}`
      ));
    })
    .join(" ");
}

export function normalizeDocumentNumber(type: IdentityDocumentType, value?: string | null) {
  const cleanValue = (value || "").trim();
  if (["DNI", "LC", "LE"].includes(type)) return cleanValue.replace(/\D/g, "");
  return cleanValue.toLocaleUpperCase("es-AR").replace(/[^A-Z0-9-]/g, "");
}

export function formatDocumentNumber(type: IdentityDocumentType, value?: string | null, emptyValue = "-") {
  const normalized = normalizeDocumentNumber(type, value);
  if (!normalized) return emptyValue;
  if (["DNI", "LC", "LE"].includes(type)) return normalized.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return normalized;
}

export async function signIn(identifier: string, password: string, remember = true) {
  const cleanIdentifier = identifier.trim().toLowerCase();
  if (!cleanIdentifier || !password) throw new Error("Escribí tu usuario o email y la contraseña.");

  setRememberSessionPreference(remember);

  const normalizedIdentifier = cleanIdentifier.includes("@") ? cleanIdentifier : cleanIdentifier.replace(/\D/g, "");
  if (!cleanIdentifier.includes("@") && normalizedIdentifier.length < 6) throw new Error("Ingresá un DNI válido o tu email completo.");
  const { data, error } = await supabase.functions.invoke("login-with-identifier", {
    body: { identifier: normalizedIdentifier, password }
  });
  if (error || data?.error || !data?.access_token || !data?.refresh_token) {
    throw new Error(data?.error || "Usuario o contraseña incorrectos.");
  }
  const { error: sessionError } = await supabase.auth.setSession({
    access_token: data.access_token,
    refresh_token: data.refresh_token
  });
  if (sessionError) throw new Error("No se pudo iniciar la sesión.");

  try {
    const profile = await getCurrentProfile();
    if (!profile) throw new Error("La cuenta ingreso correctamente, pero no tiene un perfil habilitado.");
    return profile;
  } catch (error) {
    await supabase.auth.signOut();
    throw error;
  }
}

export async function requestUserAccess(input: { email: string; password: string; full_name: string }) {
  const { data, error } = await supabase.functions.invoke("request-user-access", {
    body: {
      email: input.email.trim().toLowerCase(),
      password: input.password,
      full_name: formatProperName(input.full_name),
      website: ""
    }
  });
  if (error) throw new Error(error.message);
  if (data?.error) throw new Error(data.error);
}

export async function requestPasswordReset(email: string) {
  const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
    redirectTo: `${window.location.origin}/login`
  });
  if (error) throw new Error(authErrorMessage(error));
}

export async function updateCurrentPassword(password: string) {
  const { error } = await supabase.auth.updateUser({ password });
  if (error) throw new Error(authErrorMessage(error));

  const { error: profileError } = await supabase.rpc("complete_password_change");
  throwIfError(profileError);
}

export async function resendConfirmationEmail(email: string) {
  const { error } = await supabase.auth.resend({
    type: "signup",
    email: email.trim().toLowerCase()
  });
  if (error) throw new Error(authErrorMessage(error));
}

export async function signOut() {
  await supabase.rpc("record_session_event", { p_action: "LOGOUT" });
  await supabase.auth.signOut();
}

export async function getCurrentProfile() {
  const { data: sessionData } = await supabase.auth.getSession();
  if (!sessionData.session) return null;

  const { data, error } = await supabase
    .from("profiles")
    .select("*, location:locations!profiles_location_id_fkey(*), organization:organizations!profiles_organization_id_fkey(id,commercial_name,commercial_status,active)")
    .eq("id", sessionData.session.user.id)
    .maybeSingle();

  if (error) throw new Error(`No se pudo leer el perfil del usuario: ${error.message}`);
  if (!data) throw new Error("La cuenta existe, pero falta crear su perfil. Ejecuta el parche SQL y habilitala desde Usuarios.");
  if (!data.active) throw new Error("Tu usuario esta pendiente de aprobacion por la medica/admin.");
  if (!data.is_master && data.role !== "ADMINISTRADOR" && data.organization && (["SUSPENDIDA", "BAJA"].includes(data.organization.commercial_status) || !data.organization.active)) throw new Error("El acceso de la organizacion esta suspendido. Contacta al Administrador de tu organizacion.");
  if (data.role === "SECRETARIA" && !data.location_id) {
    throw new Error("La secretaria todavia no tiene un consultorio asignado.");
  }
  return data as Profile;
}

export async function updateMyDocumentProfile(input: Pick<Profile, "specialty" | "professional_license" | "signature_name" | "institution_name" | "institutional_footer">) {
  const { data, error } = await supabase.rpc("update_my_document_profile", {
    p_specialty: input.specialty || "",
    p_professional_license: input.professional_license || "",
    p_signature_name: input.signature_name || "",
    p_institution_name: input.institution_name || "",
    p_institutional_footer: input.institutional_footer || ""
  });
  throwIfError(error);
  return data as Profile;
}

export async function uploadMySignature(file: File, previousPath?: string | null) {
  if (!['image/jpeg','image/png','image/webp'].includes(file.type)) throw new Error('La firma debe ser JPG, JPEG, PNG o WEBP.');
  if (file.size > 2 * 1024 * 1024) throw new Error('La firma no puede superar 2 MB.');
  const { data: session } = await supabase.auth.getSession();
  const userId = session.session?.user.id;
  if (!userId) throw new Error('Sesion invalida.');
  const extension = file.type === 'image/png' ? 'png' : file.type === 'image/webp' ? 'webp' : 'jpg';
  const path = `${userId}/signature.${extension}`;
  const { error: uploadError } = await supabase.storage.from('professional-signatures').upload(path, file, { upsert: true, contentType: file.type });
  throwIfError(uploadError);
  const { error: profileError } = await supabase.rpc('set_my_signature_path', { p_signature_path: path });
  if (profileError) { await supabase.storage.from('professional-signatures').remove([path]); throwIfError(profileError); }
  if (previousPath && previousPath !== path) await supabase.storage.from('professional-signatures').remove([previousPath]);
  return path;
}

export async function removeMySignature(path: string) {
  const { error: removeError } = await supabase.storage.from('professional-signatures').remove([path]);
  throwIfError(removeError);
  const { error } = await supabase.rpc('set_my_signature_path', { p_signature_path: '' });
  throwIfError(error);
}

export async function createSignedSignatureUrl(path: string) {
  const { data, error } = await supabase.storage.from('professional-signatures').createSignedUrl(path, 300);
  throwIfError(error);
  if (!data?.signedUrl) throw new Error("No se pudo generar el acceso temporal a la firma.");
  return data.signedUrl;
}

export async function listPatients(query = "") {
  await supabase.rpc("archive_expired_web_patients");
  let request = supabase
    .from("patients")
    .select("*, insurance_plans(*), patient_locations(location_id, locations:locations!patient_locations_location_id_fkey(*)), appointments(starts_at, reason, status), clinical_evolutions(occurred_at, reason)")
    .neq("validation_status", "ARCHIVADO_NO_VALIDADO")
    .order("last_name", { ascending: true })
    .order("first_name", { ascending: true });

  if (query.trim()) {
    const cleanQuery = query.trim();
    const digits = cleanQuery.replace(/\D/g, "");
    const q = `%${cleanQuery}%`;
    const documentQuery = digits ? `%${digits}%` : q;
    request = request.or(`first_name.ilike.${q},last_name.ilike.${q},document.ilike.${documentQuery},phone.ilike.${documentQuery}`);
  }

  const { data, error } = await request;
  throwIfError(error);
  return (data || []) as Patient[];
}

export async function validateWebPatient(id: string) {
  const { error } = await supabase.rpc("validate_web_patient", { target_patient_id: id });
  throwIfError(error);
}

export async function getPatient(id: string) {
  const { data, error } = await supabase
    .from("patients")
    .select(`
      *,
      insurance_plans(*),
      patient_locations(location_id, locations:locations!patient_locations_location_id_fkey(*)),
      administrative_notes(*),
      clinical_evolutions(*, author:profiles!clinical_evolutions_created_by_fkey(id,full_name,specialty,professional_license,signature_name,signature_path,institution_name,institutional_footer)),
      communications(*),
      attachments(*),
      appointments(*, locations(*)),
      studies(*)
    `)
    .eq("id", id)
    .single();

  throwIfError(error);
  return data as Patient;
}

export async function createPatient(input: PatientInput) {
  const documentType = input.document_type || "DNI";
  const document = normalizeDocumentNumber(documentType, input.document);
  if (!document) throw new Error("El numero de documento es obligatorio para evitar pacientes duplicados.");

  const { data, error } = await supabase.rpc("register_or_link_patient", {
    p_first_name: formatProperName(input.first_name),
    p_last_name: formatProperName(input.last_name),
    p_document_type: documentType,
    p_document: document,
    p_birth_date: parseBirthDate(input.birth_date),
    p_phone: input.phone?.trim() || null,
    p_email: input.email?.trim() || null,
    p_affiliate_number: input.affiliate_number?.trim() || null,
    p_insurance_plan_id: input.insurance_plan_id || null,
    p_location_id: input.location_id || null
  });
  if (error?.message?.includes("register_or_link_patient") && error.message.includes("schema cache")) {
    throw new Error("Supabase necesita la actualizacion de pacientes unicos. Ejecuta supabase/patient_uniqueness.sql en el SQL Editor y vuelve a intentar.");
  }
  throwIfError(error);

  const result = data as { patient_id: string; already_existed: boolean };
  const patient = await getPatient(result.patient_id);
  return { ...patient, linked_existing: result.already_existed };
}

export async function updatePatientContact(id: string, input: PatientContactInput) {
  const { data, error } = await supabase
    .from("patients")
    .update({
      phone: input.phone?.trim() || null,
      email: input.email?.trim() || null,
      affiliate_number: input.affiliate_number?.trim() || null,
      insurance_plan_id: input.insurance_plan_id || null,
      documentation_pending: input.documentation_pending || false,
      documentation_note: input.documentation_note?.trim() || null
    })
    .eq("id", id)
    .select("*, insurance_plans(*), patient_locations(location_id, locations:locations!patient_locations_location_id_fkey(*))")
    .single();

  throwIfError(error);
  return data as Patient;
}

export async function deactivatePatient(id: string) {
  return setPatientActive(id, false);
}

export async function setPatientActive(id: string, active: boolean) {
  const { data, error } = await supabase
    .from("patients")
    .update({ status: active ? "activo" : "baja" })
    .eq("id", id)
    .select("*, insurance_plans(*), patient_locations(location_id, locations:locations!patient_locations_location_id_fkey(*))")
    .single();

  throwIfError(error);
  return data as Patient;
}

export async function createClinicalEvolution(input: ClinicalEvolutionInput) {
  const { data: sessionData } = await supabase.auth.getSession();
  const { data, error } = await supabase
    .from("clinical_evolutions")
    .insert({
      patient_id: input.patient_id,
      occurred_at: toIsoDateTime(input.occurred_at),
      reason: input.reason.trim() || "Evolucion clinica",
      diagnosis: input.diagnosis?.trim() || null,
      notes: input.notes?.trim() || null,
      indications: input.indications?.trim() || null,
      requested_studies: input.requested_studies?.trim() || null,
      next_visit_at: toIsoDateTime(input.next_visit_at),
      created_by: sessionData.session?.user.id
    })
    .select("*, author:profiles!clinical_evolutions_created_by_fkey(id,full_name,specialty,professional_license,signature_name,signature_path,institution_name,institutional_footer)")
    .single();

  throwIfError(error);
  return data as ClinicalEvolution;
}

export async function createAdministrativeNote(input: AdministrativeNoteInput) {
  const { data: sessionData } = await supabase.auth.getSession();
  const { data, error } = await supabase
    .from("administrative_notes")
    .insert({
      patient_id: input.patient_id,
      text: input.text.trim(),
      created_by: sessionData.session?.user.id
    })
    .select("*")
    .single();

  throwIfError(error);
  return data as AdministrativeNote;
}

export async function listCommunicationTemplates() {
  const { data,error }=await supabase.from("communication_templates").select("*").order("name"); throwIfError(error); return (data||[]) as CommunicationTemplate[];
}
export async function saveCommunicationTemplate(template: CommunicationTemplate) {
  const { error }=await supabase.from("communication_templates").update({name:template.name,subject:template.subject,body:template.body,active:template.active,updated_at:new Date().toISOString()}).eq("id",template.id); throwIfError(error);
}
export async function createCommunication(input:{patient_id:string;appointment_id?:string|null;professional_id?:string|null;kind:string;channel:Communication["channel"];subject:string;body:string;status:NonNullable<Communication["status"]>;observation?:string}) {
  const {data:session}=await supabase.auth.getSession(); const {data,error}=await supabase.from("communications").insert({...input,appointment_id:input.appointment_id||null,professional_id:input.professional_id||null,observation:input.observation?.trim()||null,created_by:session.session?.user.id,sent_at:new Date().toISOString()}).select("*").single(); throwIfError(error); return data as Communication;
}
export async function listCommunicationAlerts() { const {data,error}=await supabase.rpc("communication_alerts"); throwIfError(error); return (data||[]) as CommunicationAlert[]; }

export async function uploadPatientAttachment(input: {
  patientId: string;
  file: File;
  origin: Attachment["origin"];
  kind: Attachment["kind"];
  description?: string;
  studyId?: string | null;
}) {
  const safeName = input.file.name.replace(/[^\w.\-]+/g, "_");
  const storagePath = `${input.patientId}/${Date.now()}-${safeName}`;

  const upload = await supabase.storage
    .from("patient-files")
    .upload(storagePath, input.file, { upsert: false });
  throwIfError(upload.error);

  const { data, error } = await supabase
    .from("attachments")
    .insert({
      patient_id: input.patientId,
      study_id: input.studyId || null,
      file_name: input.file.name,
      storage_path: storagePath,
      external_url: null,
      storage_provider: "SUPABASE",
      mime_type: input.file.type || null,
      size_bytes: input.file.size,
      origin: input.origin,
      kind: input.kind,
      description: input.description || null,
      pending_send: false
    })
    .select("*")
    .single();

  throwIfError(error);
  return data as Attachment;
}

export async function linkDriveAttachment(input: {
  patientId: string;
  fileName: string;
  driveUrl: string;
  origin: Attachment["origin"];
  kind: Attachment["kind"];
  description?: string;
  studyId?: string | null;
}) {
  const { data, error } = await supabase
    .from("attachments")
    .insert({
      patient_id: input.patientId,
      study_id: input.studyId || null,
      file_name: input.fileName.trim(),
      storage_path: null,
      external_url: input.driveUrl.trim(),
      storage_provider: "GOOGLE_DRIVE",
      mime_type: "application/pdf",
      size_bytes: null,
      origin: input.origin,
      kind: input.kind,
      description: input.description || null,
      pending_send: false
    })
    .select("*")
    .single();

  throwIfError(error);
  return data as Attachment;
}

export async function createSignedAttachmentUrl(path: string) {
  const { data, error } = await supabase.storage
    .from("patient-files")
    .createSignedUrl(path, 60 * 10);
  throwIfError(error);
  if (!data) throw new Error("No se pudo generar el enlace del adjunto.");
  return data.signedUrl;
}

export async function listAppointments() {
  const { data, error } = await supabase
    .from("appointments")
    .select("*, patients(*, insurance_plans(*)), locations(*), doctor:profiles!appointments_doctor_id_fkey(id,full_name,specialty), appointment_practices(practices(name,preparation_instructions)), communications(status,channel,created_at)")
    .order("starts_at", { ascending: true });
  throwIfError(error);
  return (data || []) as Appointment[];
}

export async function listPublicBookingDoctors() {
  const { data, error } = await supabase.rpc("public_booking_doctors");
  if (error?.message?.includes("schema cache")) {
    throw new Error("Los turnos online se estan configurando. Volve a intentar en unos minutos.");
  }
  throwIfError(error);
  return (data || []) as PublicBookingDoctor[];
}

export async function getPublicCommercialCatalog(organizationSlug?: string) {
  const { data, error } = organizationSlug
    ? await supabase.rpc("public_commercial_catalog_for_slug", { p_slug: organizationSlug })
    : await supabase.rpc("public_commercial_catalog");
  throwIfError(error);
  const value = data as Partial<PublicCommercialCatalog> | null;
  return { specialties: value?.specialties || [], practices: value?.practices || [], professionals: value?.professionals || [], locations: value?.locations || [] } as PublicCommercialCatalog;
}

export async function getOrganizationSettings(organizationSlug?: string) {
  const { data, error } = organizationSlug
    ? await supabase.rpc("public_organization_settings_for_slug", { p_slug: organizationSlug })
    : await supabase.rpc("public_organization_settings");
  throwIfError(error);
  return data as OrganizationSettings;
}

export async function getMasterOrganizationCatalog() {
  const { data,error }=await supabase.rpc("master_organization_catalog"); throwIfError(error); return data as OrganizationCommercialCatalog;
}
export async function masterCreateOrganization(input: Record<string,unknown>) {
  const { data,error }=await supabase.rpc("master_create_organization",{p_data:input}); throwIfError(error); return data as CommercialOrganization;
}
export async function masterUpdateOrganizationCommercial(id:string,input:Record<string,unknown>) {
  const { error }=await supabase.rpc("master_update_organization_commercial",{p_organization_id:id,p_data:input}); throwIfError(error);
}
export async function masterSaveCommercialPlan(input:Partial<CommercialPlan>) {
  const { data,error }=await supabase.rpc("master_save_commercial_plan",{p_data:input}); throwIfError(error); return data as CommercialPlan;
}
export async function getOrganizationCommercialAccount() {
  const { data,error }=await supabase.rpc("organization_commercial_account"); throwIfError(error); return data as OrganizationCommercialAccount;
}
export async function masterRecordCommercialPayment(organizationId:string,input:Record<string,unknown>) {
  const { data,error }=await supabase.rpc("master_record_commercial_payment",{p_organization_id:organizationId,p_data:input}); throwIfError(error); return data as CommercialPayment;
}
export async function masterVoidCommercialPayment(paymentId:string,reason:string) {
  const { error }=await supabase.rpc("master_void_commercial_payment",{p_payment_id:paymentId,p_reason:reason}); throwIfError(error);
}

export async function updateOrganizationSettings(settings: Partial<OrganizationSettings>) {
  const { data, error } = await supabase.rpc("update_organization_settings", { p_settings: settings });
  throwIfError(error);
  return data as OrganizationSettings;
}

export async function uploadOrganizationLogo(file: File, organizationId: string) {
  if (!['image/jpeg','image/png','image/webp'].includes(file.type)) throw new Error("El logo debe ser JPG, PNG o WEBP.");
  if (file.size > 2 * 1024 * 1024) throw new Error("El logo no puede superar 2 MB.");
  const extension = file.type === 'image/png' ? 'png' : file.type === 'image/webp' ? 'webp' : 'jpg';
  const path = `${organizationId}/logo.${extension}`;
  const { error } = await supabase.storage.from('organization-assets').upload(path, file, { upsert: true, contentType: file.type });
  throwIfError(error);
  await updateOrganizationSettings({ logo_path: path });
  return path;
}

export function organizationLogoUrl(path?: string | null) {
  if (!path) return "";
  return supabase.storage.from('organization-assets').getPublicUrl(path).data.publicUrl;
}

export async function listOrganizationCenters() {
  const { data,error }=await supabase.from('centers').select('*').order('name'); throwIfError(error); return (data||[]) as OrganizationCenter[];
}
export async function saveOrganizationCenter(input: Partial<OrganizationCenter>&{name:string}) {
  if(input.id){const {error}=await supabase.from('centers').update({name:input.name,address:input.address||null,phone:input.phone||null,email:input.email||null,active:input.active,published:input.published}).eq('id',input.id);throwIfError(error);return;}
  const {error}=await supabase.from('centers').insert({name:input.name,address:input.address||null,phone:input.phone||null,email:input.email||null,active:input.active??true,published:input.published??true});throwIfError(error);
}

export async function getCommercialAdminCatalog() {
  const { data, error } = await supabase.rpc("commercial_admin_catalog"); throwIfError(error); return data as CommercialAdminCatalog;
}
export async function getDashboardReport(filters: DashboardFilters) {
  const { data, error } = await supabase.rpc("dashboard_report", {
    p_from: filters.from, p_to: filters.to, p_professional_id: filters.professional_id || null,
    p_specialty_id: filters.specialty_id || null, p_practice_id: filters.practice_id || null,
    p_location_id: filters.location_id || null, p_status: filters.status || null,
    p_source: filters.source || null, p_validation_status: filters.validation_status || null
  });
  throwIfError(error);
  return data as DashboardReport;
}
export async function createCommercialSpecialty(input: { name: string; description?: string }) {
  const { error } = await supabase.from("specialties").insert({ name: formatProperName(input.name), description: input.description?.trim() || null }); throwIfError(error);
}
export async function updateCommercialSpecialty(id: string, input: Partial<CommercialSpecialty>) {
  const { error } = await supabase.from("specialties").update(input).eq("id", id); throwIfError(error);
}
export async function createCommercialPractice(input: { specialty_id: string; name: string; duration_min: number }) {
  const { error } = await supabase.from("practices").insert({ specialty_id: input.specialty_id, name: formatProperName(input.name), duration_min: input.duration_min }); throwIfError(error);
}
export async function updateCommercialPractice(id: string, input: Partial<CommercialPractice>) {
  const { error } = await supabase.from("practices").update(input).eq("id", id); throwIfError(error);
}
export async function setProfessionalCommercialProfile(input: { professional_id: string; published: boolean; specialty_ids: string[]; practice_ids: string[] }) {
  const { error } = await supabase.rpc("set_professional_commercial_profile", { p_professional_id: input.professional_id, p_published: input.published, p_specialty_ids: input.specialty_ids, p_practice_ids: input.practice_ids }); throwIfError(error);
}
export async function listProfessionalLocationAssignments() { const {data,error}=await supabase.from('professional_locations').select('professional_id,location_id').eq('active',true);throwIfError(error);return (data||[]) as Array<{professional_id:string;location_id:string}>; }
export async function setProfessionalLocations(professionalId:string,locationIds:string[]) { const {error}=await supabase.rpc('set_professional_locations',{p_professional_id:professionalId,p_location_ids:locationIds});throwIfError(error); }

export async function getBuenosAiresClock() {
  const { data, error } = await supabase.rpc("current_buenos_aires_clock");
  throwIfError(error);
  return data as BuenosAiresClock;
}

export async function listPublicBookingSlots(doctorId: string, date: string, durationMin: number) {
  const { data, error } = await supabase.rpc("public_booking_slots", {
    p_doctor_id: doctorId,
    p_date: date,
    p_duration_min: durationMin
  });
  if (error?.message?.includes("schema cache")) {
    throw new Error("Los turnos online se estan configurando. Volve a intentar en unos minutos.");
  }
  throwIfError(error);
  return (data || []) as PublicBookingSlot[];
}

export async function listPublicBookingDates(doctorId: string, from: string, to: string, durationMin: number) {
  const { data, error } = await supabase.rpc("public_booking_available_dates", {
    p_doctor_id: doctorId,
    p_from: from,
    p_to: to,
    p_duration_min: durationMin
  });
  if (error?.message?.includes("schema cache")) {
    throw new Error("El almanaque de turnos se esta configurando. Volve a intentar en unos minutos.");
  }
  throwIfError(error);
  return (data || []) as PublicBookingDate[];
}

export async function listProfessionalSecretaryAssignments() {
  const { data, error } = await supabase
    .from("professional_secretaries")
    .select("professional_id,secretary_id,active")
    .eq("active", true);
  throwIfError(error);
  return (data || []) as ProfessionalSecretaryAssignment[];
}

export async function setSecretaryProfessionals(secretaryId: string, professionalIds: string[]) {
  const { error } = await supabase.rpc("set_secretary_professionals", {
    p_secretary_id: secretaryId,
    p_professional_ids: professionalIds
  });
  throwIfError(error);
}

export async function listAuditLogs(filters: { action?: string; entity?: string; from?: string; to?: string } = {}) {
  let query = supabase
    .from("audit_logs")
    .select("id,action,entity,entity_id,user_id,created_at,after,actor:profiles!audit_logs_user_id_fkey(full_name,role)")
    .order("created_at", { ascending: false })
    .limit(300);
  if (filters.action) query = query.ilike("action", `%${filters.action}%`);
  if (filters.entity) query = query.eq("entity", filters.entity);
  if (filters.from) query = query.gte("created_at", `${filters.from}T00:00:00-03:00`);
  if (filters.to) query = query.lte("created_at", `${filters.to}T23:59:59-03:00`);
  const { data, error } = await query;
  throwIfError(error);
  return (data || []) as unknown as AuditLog[];
}

export async function searchPublicBookingSlots(input: {
  organizationSlug?: string;
  specialtyId: string;
  practiceIds: string[];
  from: string;
  to: string;
  doctorId?: string;
  locationId?: string;
}) {
  const { data, error } = await supabase.rpc("public_search_booking_slots", {
    p_organization_slug: input.organizationSlug || null,
    p_specialty_id: input.specialtyId,
    p_practice_ids: input.practiceIds,
    p_from: input.from,
    p_to: input.to,
    p_doctor_id: input.doctorId || null,
    p_location_id: input.locationId || null
  });
  if (error?.message?.includes("schema cache")) {
    throw new Error("La búsqueda de turnos se está actualizando. Volvé a intentar en unos minutos.");
  }
  throwIfError(error);
  return (data || []) as PublicBookingSearchSlot[];
}

export async function listPublicBookingInsurancePlans(organizationSlug?:string) {
  const { data, error } = organizationSlug
    ? await supabase.rpc("public_booking_insurance_plans_for_slug",{p_slug:organizationSlug})
    : await supabase.rpc("public_booking_insurance_plans");
  if (error?.message?.includes("schema cache")) {
    throw new Error("Las obras sociales se estan configurando. Volve a intentar en unos minutos.");
  }
  throwIfError(error);
  return (data || []) as Pick<InsurancePlan, "id" | "name">[];
}

export async function requestCatalogBooking(input: CatalogBookingInput) {
  const document = normalizeDocumentNumber(input.document_type, input.document);
  const { data, error } = await supabase.rpc("public_request_catalog_appointment", {
    p_doctor_id: input.doctor_id, p_starts_at: input.starts_at, p_practice_ids: input.practice_ids,
    p_first_name: formatProperName(input.first_name), p_last_name: formatProperName(input.last_name),
    p_document_type: input.document_type, p_document: document, p_phone: input.phone || "", p_email: input.email || "",
    p_insurance_plan_id: input.insurance_plan_id || null, p_website: input.website || ""
  });
  throwIfError(error);
  return data as PublicBookingResult;
}

export async function requestPublicBooking(input: PublicBookingInput) {
  const document = normalizeDocumentNumber(input.document_type, input.document);
  const { data, error } = await supabase.rpc("public_request_appointment", {
    p_doctor_id: input.doctor_id,
    p_starts_at: input.starts_at,
    p_types: input.types,
    p_first_name: formatProperName(input.first_name),
    p_last_name: formatProperName(input.last_name),
    p_document_type: input.document_type,
    p_document: document,
    p_phone: input.phone?.trim() || null,
    p_email: input.email?.trim() || null,
    p_insurance_plan_id: input.insurance_plan_id || null,
    p_website: input.website || ""
  });
  if (error?.message?.includes("schema cache")) {
    throw new Error("Los turnos web todavia no estan habilitados en Supabase. Ejecuta supabase/public_booking.sql.");
  }
  throwIfError(error);
  return data as PublicBookingResult;
}

export async function createAppointment(input: AppointmentInput) {
  const normalizedType = normalizeAppointmentType(input.type, input.reason);
  const { data, error } = await supabase
    .from("appointments")
    .insert({
      starts_at: toIsoDateTime(input.starts_at),
      duration_min: input.duration_min,
      type: normalizedType.type,
      reason: normalizedType.reason,
      patient_id: input.patient_id,
      location_id: input.location_id,
      doctor_id: input.doctor_id || null
    })
    .select("*, patients(*), locations(*)")
    .single();

  throwIfError(error);
  return data as Appointment;
}

export async function updateAppointment(id: string, input: AppointmentUpdateInput) {
  const update: Record<string, unknown> = {};
  if (input.starts_at !== undefined) update.starts_at = toIsoDateTime(input.starts_at);
  if (input.duration_min !== undefined) update.duration_min = input.duration_min;
  if (input.type !== undefined) {
    const normalizedType = normalizeAppointmentType(input.type, input.reason);
    update.type = normalizedType.type;
    update.reason = normalizedType.reason;
  } else if (input.reason !== undefined) {
    update.reason = input.reason?.trim() || null;
  }
  if (input.patient_id !== undefined) update.patient_id = input.patient_id;
  if (input.location_id !== undefined) update.location_id = input.location_id;
  if (input.status !== undefined) update.status = input.status;

  const { data, error } = await supabase
    .from("appointments")
    .update(update)
    .eq("id", id)
    .select("*, patients(*), locations(*)")
    .single();

  throwIfError(error);
  return data as Appointment;
}

function normalizeAppointmentType(type: string, reason?: string | null) {
  const cleanType = (type || "CONSULTA").trim() || "CONSULTA";
  const cleanReason = reason?.trim() || "";
  if (!cleanType.includes("+")) return { type: cleanType, reason: cleanReason || null };

  const firstType = cleanType.split("+")[0] || "CONSULTA";
  const marker = `[[MOTIVOS_TURNO:${cleanType}]]`;
  const reasonWithoutMarker = cleanReason.replace(/^\[\[MOTIVOS_TURNO:[A-Z_+]+\]\]\s*/, "").trim();
  return {
    type: firstType,
    reason: `${marker}${reasonWithoutMarker ? `\n${reasonWithoutMarker}` : ""}`
  };
}

export async function listStudies() {
  const { data, error } = await supabase
    .from("studies")
    .select("*, patients(*)")
    .order("created_at", { ascending: false });
  throwIfError(error);
  return (data || []) as Study[];
}

export async function listAttachments() {
  const { data, error } = await supabase
    .from("attachments")
    .select("*, patients(id, first_name, last_name, document_type, document)")
    .order("created_at", { ascending: false });
  throwIfError(error);
  return (data || []) as Attachment[];
}

export async function listReports() {
  const { data, error } = await supabase
    .from("reports")
    .select("*")
    .order("detected_at", { ascending: false });
  throwIfError(error);
  return (data || []) as Report[];
}

export async function getConfiguration() {
  const [insurancePlans, locations, availability] = await Promise.all([
    supabase.from("insurance_plans").select("*").order("name"),
    supabase.from("locations").select("*").order("name"),
    supabase.from("medical_availability").select("*, locations(*), doctor:profiles!medical_availability_doctor_id_fkey(id,full_name,specialty,professional_license)").order("weekday")
  ]);
  const holidays = await supabase.from("holidays").select("*").order("date");

  throwIfError(insurancePlans.error);
  throwIfError(locations.error);
  throwIfError(availability.error);

  return {
    insurancePlans: insurancePlans.data as InsurancePlan[],
    locations: locations.data as Location[],
    availability: availability.data as MedicalAvailability[],
    holidays: holidays.error ? [] : holidays.data as Holiday[]
  };
}

export async function createLocation(input: LocationInput) {
  const { data, error } = await supabase
    .from("locations")
    .insert({
      name: input.name.trim(),
      address: input.address?.trim() || null,
      active: input.active ?? true
    })
    .select("*")
    .single();
  throwIfError(error);
  return data as Location;
}

export async function updateLocation(id: string, input: LocationInput) {
  const { data, error } = await supabase
    .from("locations")
    .update({
      name: input.name.trim(),
      address: input.address?.trim() || null,
      active: input.active ?? true
    })
    .eq("id", id)
    .select("*")
    .single();
  throwIfError(error);
  return data as Location;
}

export async function deleteLocation(id: string) {
  const { error } = await supabase.rpc("delete_location_if_unused", { target_location_id: id });
  throwIfError(error);
}

export async function createInsurancePlan(input: InsurancePlanInput) {
  const { data, error } = await supabase
    .from("insurance_plans")
    .insert({ name: input.name.trim(), active: input.active ?? true })
    .select("*")
    .single();
  throwIfError(error);
  return data as InsurancePlan;
}

export async function updateInsurancePlan(id: string, input: InsurancePlanInput) {
  const { data, error } = await supabase
    .from("insurance_plans")
    .update({ name: input.name.trim(), active: input.active ?? true })
    .eq("id", id)
    .select("*")
    .single();
  throwIfError(error);
  return data as InsurancePlan;
}

export async function createAvailability(input: MedicalAvailabilityInput) {
  const { data, error } = await supabase
    .from("medical_availability")
    .insert(input)
    .select("*, locations(*), doctor:profiles!medical_availability_doctor_id_fkey(id,full_name,specialty,professional_license)")
    .single();
  throwIfError(error);
  return data as MedicalAvailability;
}

export async function updateAvailability(id: string, input: MedicalAvailabilityInput) {
  const { data, error } = await supabase
    .from("medical_availability")
    .update(input)
    .eq("id", id)
    .select("*, locations(*), doctor:profiles!medical_availability_doctor_id_fkey(id,full_name,specialty,professional_license)")
    .single();
  throwIfError(error);
  return data as MedicalAvailability;
}

export async function createHoliday(input: { date: string; name?: string; kind?: Holiday["kind"]; active?: boolean }) {
  const kind = input.kind || "FERIADO";
  const { data, error } = await supabase
    .from("holidays")
    .insert({ date: input.date, name: input.name?.trim() || "Feriado", kind, active: input.active ?? true })
    .select("*")
    .single();
  throwIfError(error);
  return data as Holiday;
}

export async function updateHoliday(id: string, input: { date: string; name: string; kind: Holiday["kind"]; active: boolean }) {
  const { data, error } = await supabase
    .from("holidays")
    .update({ date: input.date, name: input.name.trim() || "Feriado", kind: input.kind || "FERIADO", active: input.active })
    .eq("id", id)
    .select("*")
    .single();
  throwIfError(error);
  return data as Holiday;
}

export async function listProfiles() {
  const data = await invokeUserAdministration({ action: "list_users" });
  return (data.profiles || []) as Profile[];
}

export async function listOrganizations() {
  const { data, error } = await supabase.from("organizations").select("id,commercial_name,active").order("commercial_name");
  throwIfError(error);
  return (data || []) as OrganizationSummary[];
}

export async function createProfile(input: ProfileInput) {
  const { data, error } = await supabase
    .from("profiles")
    .insert({
      id: input.id,
      email: input.email.trim(),
      full_name: formatProperName(input.full_name),
      role: input.role,
      location_id: input.role === "SECRETARIA" ? input.location_id : null,
      active: input.active,
      document_number: input.document_number?.replace(/\D/g, "") || null
    })
    .select("*, location:locations(*)")
    .single();
  throwIfError(error);
  return data as Profile;
}

export async function createUserWithLogin(input: NewUserInput) {
  const data = await invokeUserAdministration({
    action: "create_user",
    email: input.email.trim().toLowerCase(),
    password: input.password,
    full_name: formatProperName(input.full_name),
    role: input.role,
    location_id: input.role === "SECRETARIA" ? input.location_id || null : null,
    document_number: input.document_number?.replace(/\D/g, "") || null,
    organization_id: input.organization_id || null
  });
  return data as { profile: Profile; temporary_password: string };
}

async function invokeUserAdministration(body: Record<string, unknown>) {
  const { data, error } = await supabase.functions.invoke("admin-manage-user", {
    body: {
      ...body
    }
  });
  if (error) {
    const context = "context" in error ? error.context : null;
    if (context instanceof Response) {
      try {
        const detail = await context.clone().json() as { error?: string };
        if (detail.error) throw new Error(detail.error);
      } catch (detailError) {
        if (detailError instanceof Error && detailError.message !== "Unexpected end of JSON input") throw detailError;
      }
    }
    throw new Error("No se pudo comunicar con la administracion segura de usuarios.");
  }
  if (data?.error) throw new Error(data.error);
  return data;
}

export async function updateProfile(id: string, input: Omit<ProfileInput, "id">) {
  const data = await invokeUserAdministration({
    action: "update_user",
    user_id: id,
    email: input.email.trim().toLowerCase(),
    full_name: formatProperName(input.full_name),
    role: input.role,
    location_id: input.role === "SECRETARIA" ? input.location_id || null : null,
    document_number: input.document_number?.replace(/\D/g, "") || null
  });
  return data.profile as Profile;
}

export async function setProfileActive(id: string, active: boolean) {
  const data = await invokeUserAdministration({ action: "set_active", user_id: id, active });
  return data.profile as Profile;
}

export async function resetUserPasswordToDocument(userId: string) {
  const data = await invokeUserAdministration({ action: "reset_password", user_id: userId });
  return data as { temporary_password: string };
}

export async function enableUserWithoutEmailConfirmation(userId: string) {
  const data = await invokeUserAdministration({ action: "confirm_email", user_id: userId });
  return data as { enabled: boolean };
}

export async function deleteUserPermanently(userId: string) {
  await invokeUserAdministration({ action: "delete_user", user_id: userId });
}
