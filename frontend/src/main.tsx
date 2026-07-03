import React, { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { Bell, Building2, CalendarDays, Check, ClipboardList, Copy, FileSignature, LayoutDashboard, MapPin, Megaphone, Pencil, Plus, Search, Settings2, ShieldCheck, Stethoscope, UsersRound } from "lucide-react";
import {
  Appointment,
  AppointmentStatus,
  AdministrativeNoteInput,
  createAppointment,
  createAdministrativeNote,
  createAvailability,
  createClinicalEvolution,
  ClinicalEvolution,
  createHoliday,
  createInsurancePlan,
  createLocation,
  deleteLocation,
  createPatient,
  formatBirthDateInput,
  formatDocumentNumber,
  formatProperName,
  getConfiguration,
  getCurrentProfile,
  getPatient,
  Holiday,
  IdentityDocumentType,
  InsurancePlan,
  listAppointments,
  listAttachments,
  listPatients,
  listProfiles,
  listOrganizations,
  listReports,
  listStudies,
  linkDriveAttachment,
  Location,
  MedicalAvailability,
  MedicalAvailabilityInput,
  normalizeDocumentNumber,
  OrganizationSummary,
  Patient,
  PatientContactInput,
  PatientInput,
  parseBirthDate,
  Profile,
  Report,
  signOut,
  setPatientActive,
  Study,
  supabase,
  updateInsurancePlan,
  updateAppointment,
  updateAvailability,
  updateHoliday,
  updateLocation,
  updatePatientContact,
  updateMyDocumentProfile,
  uploadMySignature,
  removeMySignature,
  createSignedSignatureUrl,
  validateWebPatient,
  uploadPatientAttachment,
  createSignedAttachmentUrl,
  Attachment
  ,AuditLog
  ,listAuditLogs
  ,CommunicationAlert
  ,listCommunicationAlerts
} from "./api/supabase";
import { Modal, NavButton, Page, Stat, Table } from "./components/ui";
import {
  AppointmentTypeCode,
  AppointmentTypeLabels,
  AppointmentTypePicker,
  appointmentTypeClass,
  appointmentTypeLabel,
  appointmentTypeOptions,
  appointmentTypeValue,
  buildAppointmentTypePayload,
  decodeAppointmentTypes,
  primaryAppointmentTypeClass,
  visibleAppointmentReason
} from "./features/appointments/appointmentTypes";
import { Login, PasswordRecovery } from "./features/auth/AuthScreens";
import { UserManager } from "./features/users/UserManager";
import { InstitutionalDocumentDialog } from "./features/documents/InstitutionalDocumentDialog";
import { printInstitutionalPdf } from "./features/documents/institutionalPdf";
import { CommercialCatalogManager } from "./features/commercial/CommercialCatalogManager";
import { OrganizationSettingsManager } from "./features/organization/OrganizationSettingsManager";
import { OrganizationOnboardingManager } from "./features/organization/OrganizationOnboardingManager";
import { CommercialAccountBanner } from "./features/organization/CommercialAccountBanner";
import { OperationalDashboard } from "./features/dashboard/OperationalDashboard";
import { CommunicationComposer, CommunicationTemplateManager } from "./features/communications/CommunicationCenter";
import { useBuenosAiresClock } from "./hooks/useBuenosAiresClock";
import { PublicBookingPage } from "./pages/PublicBookingPage";
import { PublicHomePage } from "./pages/PublicHomePage";
import { toBuenosAiresDatetimeLocal, toDateInputValue } from "./utils/dates";
import { documentTypeLabel, documentTypeOptions } from "./utils/identity";
import { canAccessClinical, canManageConfiguration, canManageUsers, isDoctorRole, roleLabel } from "./utils/permissions";
import "./styles.css";

type View = "inicio" | "reportes" | "agenda" | "pacientes" | "estudios" | "tareas" | "ajustes" | "usuarios" | "organizaciones";

class AppErrorBoundary extends React.Component<{ children: React.ReactNode }, { error: Error | null }> {
  state: { error: Error | null } = { error: null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="login">
        <div className="panel error-panel">
          <h1>La app no pudo cargar</h1>
          <p className="error">{this.state.error.message}</p>
          <div className="form-actions">
            <button className="secondary-action" onClick={() => window.location.reload()}>Reintentar</button>
            <button className="primary" onClick={() => signOut().finally(() => window.location.reload())}>Cerrar sesion y volver a entrar</button>
          </div>
        </div>
      </div>
    );
  }
}

function App() {
  const routePath = window.location.pathname.replace(/\/+$/, "") || "/";
  const publicBookingPath = routePath === "/turnos";
  const internalAppPath = routePath === "/app";
  const authCallback = window.location.hash.includes("type=recovery") || window.location.hash.includes("error=");
  const publicHomePath = routePath === "/" && !authCallback;
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<View>("inicio");
  const [viewResetKey, setViewResetKey] = useState(0);
  const [newAppointmentKey, setNewAppointmentKey] = useState(0);
  const [newPatientKey, setNewPatientKey] = useState(0);
  const [selectedPatientId, setSelectedPatientId] = useState<string | null>(null);
  const [menuCollapsed, setMenuCollapsed] = useState(false);
  const [passwordRecovery, setPasswordRecovery] = useState(false);
  const [authLinkError, setAuthLinkError] = useState("");
  const [mobileMoreOpen, setMobileMoreOpen] = useState(false);
  const [simulatedRole, setSimulatedRole] = useState<"" | "MEDICO" | "SECRETARIA">("");
  const [simulatedLocationId, setSimulatedLocationId] = useState("");
  const [simulationLocations, setSimulationLocations] = useState<Location[]>([]);
  const [simulatedProfessionalId, setSimulatedProfessionalId] = useState("");
  const [simulationProfessionals, setSimulationProfessionals] = useState<Profile[]>([]);

  useEffect(() => {
    if (publicBookingPath || publicHomePath) {
      setLoading(false);
      return;
    }
    const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ""));
    if (hashParams.get("error")) {
      setAuthLinkError("El enlace de acceso vencio o ya fue utilizado. Volve a ingresar o solicita uno nuevo.");
      window.history.replaceState(null, "", `${window.location.pathname}${window.location.search}`);
    }
    getCurrentProfile()
      .then(setProfile)
      .catch(async () => {
        await signOut();
        setProfile(null);
      })
      .finally(() => setLoading(false));
    const { data } = supabase.auth.onAuthStateChange(event => {
      if (event === "PASSWORD_RECOVERY") {
        setPasswordRecovery(true);
        setLoading(false);
        return;
      }
      getCurrentProfile().then(setProfile).catch(() => setProfile(null));
    });
    return () => data.subscription.unsubscribe();
  }, [publicBookingPath, publicHomePath]);

  useEffect(() => {
    if (!profile) return;
    if (!internalAppPath) window.history.replaceState(null, "", `/app${window.location.search}`);
    setView("inicio");
    setSelectedPatientId(null);
    setNewAppointmentKey(0);
    setNewPatientKey(0);
    setMobileMoreOpen(false);
    setViewResetKey(key => key + 1);
    setSimulatedRole("");
    setSimulatedLocationId("");
    setSimulatedProfessionalId("");
    if (profile.is_master || profile.role === "ADMINISTRADOR") {
      getConfiguration().then(configuration => setSimulationLocations(configuration.locations.filter(location => location.active))).catch(() => setSimulationLocations([]));
      listProfiles().then(users => setSimulationProfessionals(users.filter(user => user.active && isDoctorRole(user.role)))).catch(() => setSimulationProfessionals([]));
    }
  }, [profile?.id, internalAppPath]);

  if (publicHomePath) return <PublicHomePage />;
  if (publicBookingPath) return <PublicBookingPage />;
  if (loading) return <div className="login"><div className="panel">Cargando...</div></div>;
  if (passwordRecovery) return <PasswordRecovery onDone={nextProfile => { setProfile(nextProfile); setPasswordRecovery(false); }} />;
  if (!profile) return <Login initialError={authLinkError} onLogin={nextProfile => {
    window.history.replaceState(null, "", `/app${window.location.search}`);
    setProfile(nextProfile);
  }} />;
  if (profile.must_change_password) return <PasswordRecovery forced onDone={nextProfile => setProfile(nextProfile)} />;

  const operationalProfile: Profile = simulatedRole ? {
    ...profile,
    role: simulatedRole,
    is_master: false,
    simulated: true,
    simulated_professional_id: simulatedRole === "MEDICO" ? simulatedProfessionalId || simulationProfessionals[0]?.id || null : null,
    location_id: simulatedRole === "SECRETARIA" ? simulatedLocationId || simulationLocations[0]?.id || null : null,
    location: simulatedRole === "SECRETARIA" ? simulationLocations.find(location => location.id === (simulatedLocationId || simulationLocations[0]?.id)) || null : null
  } : profile;

  const navigate = (next: View) => {
    setView(next);
    setSelectedPatientId(null);
    setNewAppointmentKey(0);
    setNewPatientKey(0);
    setMobileMoreOpen(false);
    setViewResetKey(key => key + 1);
  };

  const navigateNewAppointment = () => {
    setView("agenda");
    setSelectedPatientId(null);
    setViewResetKey(key => key + 1);
    setNewAppointmentKey(Date.now());
    setMobileMoreOpen(false);
  };

  const navigateNewPatient = () => {
    setView("pacientes");
    setSelectedPatientId(null);
    setViewResetKey(key => key + 1);
    setNewPatientKey(Date.now());
    setMobileMoreOpen(false);
  };

  return (
    <div className={menuCollapsed ? "shell menu-collapsed" : "shell"}>
      <aside className="sidebar">
        <button className="brand-row" type="button" onClick={() => setMenuCollapsed(value => !value)} title={menuCollapsed ? "Expandir menu" : "Contraer menu"} aria-label={menuCollapsed ? "Expandir menu" : "Contraer menu"}>
          <span className="brand">SP</span>
          <div>
            <strong>{profile.full_name}</strong>
            <span>{simulatedRole ? `Vista ${roleLabel(operationalProfile)}` : roleLabel(profile)}</span>
          </div>
        </button>
        {(profile.is_master || profile.role === "ADMINISTRADOR") && <div className="role-simulator">
          <span>Vista operativa</span>
          <div><button type="button" className={!simulatedRole ? "active" : ""} onClick={() => setSimulatedRole("")}>Admin</button><button type="button" className={simulatedRole === "MEDICO" ? "active" : ""} onClick={() => setSimulatedRole("MEDICO")}>Medico</button><button type="button" className={simulatedRole === "SECRETARIA" ? "active" : ""} onClick={() => setSimulatedRole("SECRETARIA")}>Secretaria</button></div>
          {simulatedRole === "SECRETARIA" && <select aria-label="Consultorio para vista Secretaria" value={simulatedLocationId || simulationLocations[0]?.id || ""} onChange={event => setSimulatedLocationId(event.target.value)}>{simulationLocations.map(location => <option key={location.id} value={location.id}>{location.name}</option>)}</select>}
          {simulatedRole === "MEDICO" && <select aria-label="Profesional para vista Medico" value={simulatedProfessionalId || simulationProfessionals[0]?.id || ""} onChange={event => setSimulatedProfessionalId(event.target.value)}>{simulationProfessionals.map(doctor => <option key={doctor.id} value={doctor.id}>{doctor.full_name}</option>)}</select>}
          {simulatedRole && <small>Simulacion visual; conserva tu identidad real.</small>}
        </div>}
        <NotificationBell onOpenPatient={id => { setView("pacientes"); setSelectedPatientId(id); setMobileMoreOpen(false); }} />
        <button className="nav-cta" onClick={navigateNewAppointment}>
          <span>+</span>
          Nuevo turno
        </button>
        <nav className="nav-group">
          <span>Trabajo</span>
          <NavButton active={view === "inicio"} icon={<LayoutDashboard size={18} />} label="Inicio" hint="Resumen" onClick={() => navigate("inicio")} />
          <NavButton active={view === "agenda"} icon={<CalendarDays size={18} />} label="Agenda" hint="Dia y semana" onClick={() => navigate("agenda")} />
          <NavButton active={view === "pacientes"} icon={<UsersRound size={18} />} label="Pacientes" hint="Historia clinica" onClick={() => navigate("pacientes")} />
          <NavButton active={view === "estudios"} icon={<FileSignature size={18} />} label="Estudios" hint="Informes y documentos" onClick={() => navigate("estudios")} />
          <NavButton active={view === "tareas"} icon={<ClipboardList size={18} />} label="Tareas" hint="Pendientes" onClick={() => navigate("tareas")} />
        </nav>
        <nav className="nav-group">
          <span>Administracion</span>
          {canManageConfiguration(operationalProfile) && <NavButton active={view === "ajustes"} icon={<Settings2 size={18} />} label="Ajustes" hint="Consultorios y horarios" onClick={() => navigate("ajustes")} />}
          {canManageUsers(operationalProfile) && <NavButton active={view === "usuarios"} icon={<ShieldCheck size={18} />} label="Usuarios" hint="Accesos del sistema" onClick={() => navigate("usuarios")} />}
          {operationalProfile.is_master && <NavButton active={view === "organizaciones"} icon={<Building2 size={18} />} label="Clientes" hint="Organizaciones y planes" onClick={() => navigate("organizaciones")} />}
        </nav>
        <button className="logout-button" aria-label="Cerrar sesion" title="Cerrar sesion" onClick={() => signOut().then(() => { window.history.replaceState(null, "", "/login"); setProfile(null); })}>Cerrar sesion</button>
        <button className="mobile-more-button" type="button" aria-expanded={mobileMoreOpen} onClick={() => setMobileMoreOpen(value => !value)}>
          <span className="nav-icon">MA</span><span>Mas</span>
        </button>
        {mobileMoreOpen && <div className="mobile-more-menu">
          <button onClick={() => navigate("estudios")}>Estudios y documentos</button>
          <button onClick={() => navigate("tareas")}>Tareas</button>
          {canManageConfiguration(operationalProfile) && <button onClick={() => navigate("ajustes")}>Ajustes</button>}
          {canManageUsers(operationalProfile) && <button onClick={() => navigate("usuarios")}>Usuarios</button>}
          {operationalProfile.is_master && <button onClick={() => navigate("organizaciones")}>Clientes y planes</button>}
          <button className="danger-action" onClick={() => signOut().then(() => { window.history.replaceState(null, "", "/login"); setProfile(null); })}>Cerrar sesion</button>
        </div>}
      </aside>
      <main>
        <CommercialAccountBanner profile={profile} />
        {view === "inicio" && <Dashboard key={`inicio-${viewResetKey}`} profile={operationalProfile} onNavigate={navigate} onReports={() => navigate("reportes")} onNewPatient={navigateNewPatient} onOpenPatient={id => { setView("pacientes"); setSelectedPatientId(id); }} />}
        {view === "reportes" && <OperationalDashboard key={`reportes-${viewResetKey}`} profile={operationalProfile} onBack={() => navigate("inicio")} onAgenda={() => navigate("agenda")} onNewPatient={navigateNewPatient} onOpenPatient={id => { setView("pacientes"); setSelectedPatientId(id); }} />}
        {view === "agenda" && <Agenda key={`agenda-${viewResetKey}`} profile={operationalProfile} openNewKey={newAppointmentKey} onOpenPatient={id => { setView("pacientes"); setSelectedPatientId(id); }} />}
        {view === "pacientes" && <Patients key={`pacientes-${viewResetKey}`} profile={operationalProfile} selectedId={selectedPatientId} openNewKey={newPatientKey} onSelect={setSelectedPatientId} onClose={() => setSelectedPatientId(null)} />}
        {view === "estudios" && <Studies key={`estudios-${viewResetKey}`} onOpenPatient={id => { setView("pacientes"); setSelectedPatientId(id); }} />}
        {view === "tareas" && <Tasks key={`tareas-${viewResetKey}`} />}
        {view === "ajustes" && canManageConfiguration(operationalProfile) && <Settings key={`ajustes-${viewResetKey}`} profile={operationalProfile} />}
        {view === "usuarios" && canManageUsers(operationalProfile) && <Users key={`usuarios-${viewResetKey}`} profile={profile} />}
        {view === "organizaciones" && operationalProfile.is_master && <Page title="Clientes" subtitle="Organizaciones, planes y onboarding"><OrganizationOnboardingManager /></Page>}
      </main>
    </div>
  );
}

function Dashboard({ profile, onNavigate, onReports, onNewPatient, onOpenPatient }: { profile: Profile; onNavigate: (view: View) => void; onReports: () => void; onNewPatient: () => void; onOpenPatient: (id: string) => void }) {
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [patients, setPatients] = useState<Patient[]>([]);
  const [reports, setReports] = useState<Report[]>([]);
  const [query, setQuery] = useState("");

  useEffect(() => {
    Promise.all([listAppointments(), listPatients(), listReports()]).then(([nextAppointments, nextPatients, nextReports]) => {
      const secretaryLocation = profile.simulated && profile.role === "SECRETARIA" ? profile.location_id : null;
      setAppointments(secretaryLocation ? nextAppointments.filter(item => item.location_id === secretaryLocation) : nextAppointments);
      setPatients(nextPatients);
      setReports(nextReports);
    });
  }, []);

  const officialClock = useBuenosAiresClock();
  const today = officialClock.now;
  const todayAppointments = appointments
    .filter(appointment => appointment.status !== "CANCELADO" && sameLocalDate(new Date(appointment.starts_at), today))
    .sort((a, b) => new Date(a.starts_at).getTime() - new Date(b.starts_at).getTime());
  const nextAppointment = appointments
    .filter(appointment => appointment.status !== "CANCELADO" && new Date(appointment.starts_at).getTime() >= Date.now())
    .sort((a, b) => new Date(a.starts_at).getTime() - new Date(b.starts_at).getTime())[0];
  const activePatients = patients.filter(patient => patient.status !== "baja");
  const visiblePatients = activePatients
    .filter(patient => {
      const text = `${patient.first_name} ${patient.last_name} ${patient.document || ""} ${formatPatientDocument(patient)} ${patient.phone || ""}`.toLowerCase();
      return !query.trim() || text.includes(query.toLowerCase());
    })
    .slice(0, 5);
  const pendingReports = reports.filter(report => report.status !== "ASOCIADO").length;

  return (
    <Page
      title="Inicio"
      subtitle="Vista de trabajo para consultorio"
      actions={
        <>
          <button className="secondary-action" onClick={onReports}>Reportes y estadisticas</button>
          <button className="secondary-action" onClick={() => onNavigate("agenda")}>Ver agenda</button>
          <button className="primary" onClick={onNewPatient}>+ Nuevo paciente</button>
        </>
      }
    >
      <section className="dashboard-hero">
        <button className="hero-agenda" type="button" onClick={() => onNavigate("agenda")}>
          <span>Hoy</span>
          <strong>{todayAppointments.length}</strong>
          <small>{todayAppointments.length === 1 ? "turno programado" : "turnos programados"}</small>
        </button>
        {nextAppointment ? (
          <button className="hero-next hero-next-action" type="button" onClick={() => onOpenPatient(nextAppointment.patient_id)}>
            <span>Proximo turno</span>
            <>
              <strong>{new Date(nextAppointment.starts_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })} · {nextAppointment.patients?.last_name}, {nextAppointment.patients?.first_name}</strong>
              <small>{new Date(nextAppointment.starts_at).toLocaleDateString()} · {nextAppointment.locations?.name || "Sin consultorio"}</small>
            </>
          </button>
        ) : (
          <div className="hero-next">
            <span>Proximo turno</span>
            <>
              <strong>Sin turnos proximos</strong>
              <small>La agenda esta libre por ahora</small>
            </>
          </div>
        )}
        <button className="hero-patient" type="button" onClick={() => onNavigate("pacientes")}>
          <span>Pacientes activos</span>
          <strong>{activePatients.length}</strong>
          <small>Abrir buscador</small>
        </button>
      </section>

      <section className="dashboard-workspace">
        <div className="panel dashboard-panel">
          <div className="section-title">
            <div>
              <h2>Agenda de hoy</h2>
              <p>Turnos reales del dia, con consultorio y motivo.</p>
            </div>
            <button className="secondary-action" onClick={() => onNavigate("agenda")}>Agenda completa</button>
          </div>
          <div className="today-list">
            {todayAppointments.slice(0, 6).map(appointment => (
              <button className="today-item" key={appointment.id} onClick={() => onOpenPatient(appointment.patient_id)}>
                <time>{new Date(appointment.starts_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</time>
                <span>{appointment.patients?.last_name}, {appointment.patients?.first_name}</span>
                <small>{appointmentTypeLabel(appointmentTypeValue(appointment))} · {appointment.locations?.name || "Sin consultorio"}</small>
              </button>
            ))}
            {todayAppointments.length === 0 && <p className="empty-day">No hay turnos cargados para hoy.</p>}
          </div>
        </div>

        <div className="panel dashboard-panel">
          <div className="section-title">
            <div>
              <h2>Pacientes</h2>
              <p>Buscar y entrar directo a la historia clinica.</p>
            </div>
          </div>
          <input className="compact-search" value={query} onChange={event => setQuery(event.target.value)} placeholder="Nombre, documento o telefono" />
          <div className="compact-patient-list">
            {visiblePatients.map(patient => {
              const lastVisit = getLastPatientVisit(patient);
              return (
                <button className="compact-patient" key={patient.id} onClick={() => onOpenPatient(patient.id)}>
                  <span>{patient.last_name}, {patient.first_name}</span>
                  <small>{lastVisit.date} · {patient.insurance_plans?.name || "Sin obra social"}</small>
                </button>
              );
            })}
            {visiblePatients.length === 0 && <p className="empty-day">Sin pacientes para mostrar.</p>}
          </div>
        </div>
      </section>

      <section className="dashboard-secondary">
        <button className="secondary-tile" onClick={() => onNavigate("estudios")}>
          <span>Estudios</span>
          <strong>ECG, ergometria, MAPA y Holter</strong>
        </button>
        <button className="secondary-tile quiet" onClick={() => onNavigate("estudios")}>
          <span>Adjuntos pendientes</span>
          <strong>{pendingReports} archivo{pendingReports === 1 ? "" : "s"} pendiente{pendingReports === 1 ? "" : "s"}</strong>
        </button>
        <button className="secondary-tile" onClick={() => onNavigate("ajustes")}>
          <span>Consultorios</span>
          <strong>Consultorios, horarios y obras sociales</strong>
        </button>
      </section>
    </Page>
  );
}

function Agenda({ profile, openNewKey, onOpenPatient }: { profile: Profile; openNewKey?: number; onOpenPatient: (id: string) => void }) {
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [availability, setAvailability] = useState<MedicalAvailability[]>([]);
  const [holidays, setHolidays] = useState<Holiday[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [draftAppointment, setDraftAppointment] = useState<{ starts_at: string; location_id: string; duration_min: number } | null>(null);
  const [editingAppointment, setEditingAppointment] = useState<Appointment | null>(null);
  const [mode, setMode] = useState<"dia" | "semana">("dia");
  const officialClock = useBuenosAiresClock();
  const [currentDate, setCurrentDate] = useState(officialClock.today);
  const [selectedAgendaKey, setSelectedAgendaKey] = useState<string | null>(null);
  const [locationFilter, setLocationFilter] = useState("");

  async function refresh() {
    const [nextAppointments, config] = await Promise.all([listAppointments(), getConfiguration()]);
    setAppointments(nextAppointments);
    setAvailability(config.availability);
    setHolidays(config.holidays);
  }

  useEffect(() => { refresh(); }, []);
  useEffect(() => { setCurrentDate(officialClock.today); }, [officialClock.today]);

  const days = mode === "dia" ? [new Date(`${currentDate}T12:00:00`)] : getWeekDays(currentDate);
  const visibleAppointments = (appointments || []).filter(appointment => (days || []).some(day => sameLocalDate(new Date(appointment.starts_at), day)));
  const unfilteredDayModels = days.map(day => {
    const dayAppointments = visibleAppointments
      .filter(appointment => sameLocalDate(new Date(appointment.starts_at), day))
      .sort((a, b) => new Date(a.starts_at).getTime() - new Date(b.starts_at).getTime());
    return { day, slots: buildAgendaSlots(day, availability, dayAppointments, profile, holidays) };
  });
  const allUnfilteredSlots = unfilteredDayModels.flatMap(model => model.slots);
  const consultorioOptions = Array.from(
    new Map(allUnfilteredSlots.map(slot => [slot.locationId, { id: slot.locationId, name: slot.locationName }])).values()
  );
  const dayModels = unfilteredDayModels.map(model => ({
    ...model,
    slots: locationFilter ? model.slots.filter(slot => slot.locationId === locationFilter) : model.slots
  }));
  const allSlots = dayModels.flatMap(model => model.slots);
  const occupiedSlots = allSlots.filter(slot => slot.appointment);
  const freeSlots = allSlots.filter(slot => !slot.appointment);
  const selectedDaySlot = mode === "dia" ? allSlots.find(slot => slot.key === selectedAgendaKey) || occupiedSlots[0] || allSlots[0] || null : null;
  const availabilitySummary = getEligibleAvailability(profile, availability)
    .filter(slot => slot.enabled && (!locationFilter || slot.location_id === locationFilter))
    .sort((a, b) => a.weekday - b.weekday || a.start_time.localeCompare(b.start_time))
    .slice(0, 5);

  function openNewAppointment(draft?: { starts_at: string; location_id: string; duration_min: number }) {
    setEditingAppointment(null);
    setDraftAppointment(draft || null);
    setShowForm(true);
  }

  function openEditAppointment(appointment: Appointment) {
    setShowForm(false);
    setDraftAppointment(null);
    setEditingAppointment(appointment);
  }

  function closeAppointmentPanel() {
    setShowForm(false);
    setDraftAppointment(null);
    setEditingAppointment(null);
  }

  function handleSlotClick(slot: AgendaSlot) {
    setSelectedAgendaKey(slot.key);
  }

  useEffect(() => {
    if (openNewKey) openNewAppointment();
  }, [openNewKey]);

  return (
    <Page title="Agenda" subtitle="Cabina diaria por consultorio" actions={<button className="primary" onClick={() => openNewAppointment()}>+ Nuevo turno</button>}>
      {showForm && (
        <Modal onClose={closeAppointmentPanel}>
          <AppointmentForm
            key={draftAppointment ? `${draftAppointment.starts_at}-${draftAppointment.location_id}` : "manual"}
            profile={profile}
            appointments={appointments}
            initial={draftAppointment || undefined}
            onEditAppointment={openEditAppointment}
            onCancel={closeAppointmentPanel}
            onCreated={async () => { closeAppointmentPanel(); await refresh(); }}
          />
        </Modal>
      )}
      {editingAppointment && (
        <Modal onClose={closeAppointmentPanel}>
          <AppointmentEditForm
            appointment={editingAppointment}
            availability={availability}
            profile={profile}
            onCancel={closeAppointmentPanel}
            onSaved={async () => { closeAppointmentPanel(); await refresh(); }}
          />
        </Modal>
      )}
      <div className="agenda-command">
        <div className="agenda-command-main">
          <div>
            <span>Disponibilidad</span>
            <strong>{occupiedSlots.length} ocupados · {freeSlots.length} libres</strong>
          </div>
          <div className="consultorio-strip">
            {consultorioOptions.length ? <>
              <button type="button" className={!locationFilter ? "active" : ""} onClick={() => { setLocationFilter(""); setSelectedAgendaKey(null); }}>Todos</button>
              {consultorioOptions.map(location => <button type="button" className={locationFilter === location.id ? "active" : ""} key={location.id} onClick={() => { setLocationFilter(location.id); setSelectedAgendaKey(null); }}>{location.name}</button>)}
            </> : <span>Sin consultorio configurado</span>}
          </div>
        </div>
        <div className="availability-strip">
          {availabilitySummary.length ? availabilitySummary.map(slot => (
            <span key={`${slot.id}-${slot.weekday}-${slot.start_time}`}>
              {weekdayName(slot.weekday)} {slot.start_time}-{slot.end_time} · {slot.locations?.name || "Consultorio"}
            </span>
          )) : <span>Configurar horarios en Ajustes</span>}
        </div>
        <div className="agenda-toolbar">
          <div className="segmented">
            <button type="button" className={mode === "dia" ? "active" : ""} onClick={() => setMode("dia")}>Dia</button>
            <button type="button" className={mode === "semana" ? "active" : ""} onClick={() => setMode("semana")}>Semana</button>
          </div>
          <AgendaMiniCalendar
            currentDate={currentDate}
            appointments={appointments}
            availability={availability}
            holidays={holidays}
            profile={profile}
            officialToday={officialClock.today}
            onChange={date => {
              setCurrentDate(date);
              setSelectedAgendaKey(null);
            }}
          />
        </div>
        <details className="agenda-references">
          <summary>Referencias de colores</summary>
          <div className="agenda-legend" aria-label="Estados de los turnos">
            <span><i className="legend-dot free"></i>Horario libre</span>
            <span><i className="legend-dot confirmed"></i>Confirmado</span>
            <span><i className="legend-dot pending"></i>Pendiente</span>
            <span><i className="legend-dot reminder"></i>Recordatorio enviado</span>
            <span><i className="legend-dot absent"></i>Ausente</span>
          </div>
          <div className="type-legend" aria-label="Motivos del turno">
            {appointmentTypeOptions().map(option => <span className={`type-label ${appointmentTypeClass(option.value)}`} key={option.value}>{option.label}</span>)}
          </div>
        </details>
      </div>

      <div className={mode === "dia" ? "agenda-board day-board" : "agenda-board"}>
        {dayModels.map(({ day, slots: daySlots }) => {
          return (
            <section className="agenda-day" key={day.toISOString()}>
              <h2>{weekdayName(day.getDay())} <span>{day.toLocaleDateString()}</span></h2>
              {daySlots.length === 0 && <p className="empty-day">Sin atencion configurada</p>}
              {daySlots.map(slot => (
                <article className={`${slot.appointment ? `appointment-card occupied-slot ${appointmentStatusClass(slot.appointment.status)} ${primaryAppointmentTypeClass(appointmentTypeValue(slot.appointment))}` : "appointment-card free-slot"} ${selectedAgendaKey === slot.key ? "selected-slot" : ""}`} key={slot.key}>
                  {slot.appointment ? (
                    <>
                      <button className="slot-button" type="button" onClick={() => handleSlotClick(slot)} onDoubleClick={() => openEditAppointment(slot.appointment!)}>
                        <time>{slot.time}</time>
                        <strong>{slot.appointment.patients?.last_name}, {slot.appointment.patients?.first_name}</strong>
                        <AppointmentTypeLabels value={appointmentTypeValue(slot.appointment)} />
                        <small>{slot.appointment.locations?.name} · {appointmentStatusLabel(slot.appointment.status)}{slot.appointment.communications?.some(item => item.status === "ENVIADO_MANUAL" || item.status === "CONTACTADO") ? " · Contactado" : ""}</small>
                      </button>
                      <button className="link slot-link" type="button" onClick={() => onOpenPatient(slot.appointment!.patient_id)}>Abrir paciente</button>
                    </>
                  ) : (
                    <button className="slot-button" type="button" onClick={() => handleSlotClick(slot)} onDoubleClick={() => openNewAppointment({ starts_at: slot.startsAt, location_id: slot.locationId, duration_min: slot.durationMin })}>
                      <time>{slot.time}</time>
                      <strong>Libre</strong>
                      <small>{slot.locationName}</small>
                    </button>
                  )}
                </article>
              ))}
            </section>
          );
        })}
        {mode === "dia" && (
          <AgendaDayDetail
            slot={selectedDaySlot}
            profile={profile}
            onOpenPatient={onOpenPatient}
            onEditAppointment={openEditAppointment}
            onNewAppointment={openNewAppointment}
          />
        )}
      </div>
    </Page>
  );
}

function AgendaDayDetail({
  slot,
  profile,
  onOpenPatient,
  onEditAppointment,
  onNewAppointment
}: {
  slot: AgendaSlot | null;
  profile: Profile;
  onOpenPatient: (id: string) => void;
  onEditAppointment: (appointment: Appointment) => void;
  onNewAppointment: (draft: { starts_at: string; location_id: string; duration_min: number }) => void;
}) {
  const [showCommunication,setShowCommunication]=useState(false);
  if (!slot) {
    return (
      <aside className="agenda-detail-panel">
        <h2>Detalle del dia</h2>
        <p className="empty-day">Selecciona un horario para ver informacion o cargar un turno.</p>
      </aside>
    );
  }

  const appointment = slot.appointment;
  const patient = appointment?.patients;
  const whatsapp = patient ? buildWhatsappUrl(patient.phone, `Hola ${patient.first_name}, le escribimos del consultorio.`) : "";
  const mail = patient?.email ? `mailto:${patient.email}?subject=${encodeURIComponent("Consultorio cardiologia")}` : "";

  if (!appointment) {
    return (
      <aside className="agenda-detail-panel free-detail">
        <span className="detail-kicker">Horario libre</span>
        <h2>{slot.time}</h2>
        <p>{slot.locationName}</p>
        <div className="detail-actions">
          <button className="primary" onClick={() => onNewAppointment({ starts_at: slot.startsAt, location_id: slot.locationId, duration_min: slot.durationMin })}>Dar turno aca</button>
        </div>
        <p className="notice">Doble click sobre el horario tambien abre la carga del turno.</p>
      </aside>
    );
  }

  return (
    <aside className={`agenda-detail-panel ${appointmentStatusClass(appointment.status)}`}>
      <div className="detail-head">
        <span className="detail-kicker">{appointmentStatusLabel(appointment.status)}</span>
        <strong>{slot.time}</strong>
      </div>
      <h2>{patient ? `${patient.last_name}, ${patient.first_name}` : "Paciente sin cargar"}</h2>
      <p><AppointmentTypeLabels value={appointmentTypeValue(appointment)} />{visibleAppointmentReason(appointment.reason) ? ` ${visibleAppointmentReason(appointment.reason)}` : ""}</p>

      <div className="detail-grid">
        <div><span>Documento / H.C.</span><strong>{patient ? formatPatientDocument(patient) : "-"}</strong></div>
        <div><span>Obra social</span><strong>{patient?.insurance_plans?.name || "-"}</strong></div>
        <div><span>Nro. afiliado</span><strong>{patient?.affiliate_number || "-"}</strong></div>
        <div><span>Consultorio</span><strong>{appointment.locations?.name || slot.locationName}</strong></div>
        <div><span>Motivo</span><strong>{appointmentTypeLabel(appointmentTypeValue(appointment))}</strong></div>
        <div><span>Telefono</span><strong>{patient?.phone || "-"}</strong></div>
        <div><span>Email</span><strong>{patient?.email || "-"}</strong></div>
        <div><span>Contacto</span><strong>{appointment.communications?.some(item=>item.status==="ENVIADO_MANUAL"||item.status==="CONTACTADO")?"Registrado":"Pendiente"}</strong></div>
      </div>

      <div className="detail-actions">
        <button className="primary" onClick={() => onEditAppointment(appointment)}>Editar turno</button>
        {patient && <button className="secondary-action" onClick={() => onOpenPatient(patient.id)}>Abrir historia</button>}
        {whatsapp ? <a href={whatsapp} target="_blank" rel="noreferrer">WhatsApp</a> : <span>Sin WhatsApp</span>}
        {mail ? <a href={mail}>Email</a> : <span>Sin email</span>}
        {patient&&<button className="secondary-action" onClick={()=>setShowCommunication(!showCommunication)}>Comunicar</button>}
      </div>
      {showCommunication&&patient&&<CommunicationComposer patient={patient} appointment={appointment} profile={profile}/>}
    </aside>
  );
}

function AgendaMiniCalendar({
  currentDate,
  officialToday,
  appointments,
  availability,
  holidays,
  profile,
  onChange
}: {
  currentDate: string;
  officialToday: string;
  appointments: Appointment[];
  availability: MedicalAvailability[];
  holidays: Holiday[];
  profile: Profile;
  onChange: (date: string) => void;
}) {
  const selected = new Date(`${currentDate}T12:00:00`);
  const [year, setYear] = useState(selected.getFullYear());
  const [month, setMonth] = useState(selected.getMonth());

  useEffect(() => {
    const next = new Date(`${currentDate}T12:00:00`);
    setYear(next.getFullYear());
    setMonth(next.getMonth());
  }, [currentDate]);

  const cells = buildMonthCalendar(year, month);
  const monthNames = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
  const years = Array.from({ length: 7 }, (_, index) => selected.getFullYear() - 3 + index);

  function shiftMonth(delta: number) {
    const date = new Date(year, month + delta, 1, 12);
    setYear(date.getFullYear());
    setMonth(date.getMonth());
  }

  function chooseMonth(nextMonth: number) {
    setMonth(nextMonth);
  }

  function chooseYear(nextYear: number) {
    setYear(nextYear);
  }

  return (
    <div className="mini-calendar">
      <div className="mini-calendar-head">
        <button type="button" onClick={() => shiftMonth(-1)} aria-label="Mes anterior">{"<"}</button>
        <select value={month} onChange={event => chooseMonth(Number(event.target.value))}>
          {monthNames.map((name, index) => <option key={name} value={index}>{name}</option>)}
        </select>
        <select value={year} onChange={event => chooseYear(Number(event.target.value))}>
          {years.map(item => <option key={item} value={item}>{item}</option>)}
        </select>
        <button type="button" onClick={() => shiftMonth(1)} aria-label="Mes siguiente">{">"}</button>
        <button type="button" className="today-mini" onClick={() => onChange(officialToday)}>Hoy</button>
      </div>
      <div className="mini-calendar-grid">
        {["Lu", "Ma", "Mi", "Ju", "Vi", "Sa", "Do"].map(day => <span className="mini-weekday" key={day}>{day}</span>)}
        {cells.map((cell, index) => {
          if (!cell) return <span className="mini-day empty" key={`empty-${index}`} />;
          const dateValue = toDateInputValue(cell);
          const hasHoliday = isHoliday(cell, holidays);
          const hasAttention = !hasHoliday && hasAvailabilityOnDate(cell, availability, profile);
          const hasAppointment = (appointments || []).some(appointment => appointment.status !== "CANCELADO" && sameLocalDate(new Date(appointment.starts_at), cell));
          const selectedDay = dateValue === currentDate;
          return (
            <button
              key={dateValue}
              type="button"
              className={`mini-day ${hasHoliday ? "is-holiday" : ""} ${hasAttention ? "has-attention" : "no-attention"} ${hasAppointment ? "has-appointment" : ""} ${selectedDay ? "selected" : ""}`}
              onClick={() => onChange(dateValue)}
              title={hasHoliday ? "Dia no laborable" : hasAttention ? "Hay atencion configurada" : "Sin atencion configurada"}
            >
              {cell.getDate()}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function buildMonthCalendar(year: number, month: number) {
  const first = new Date(year, month, 1, 12);
  const startOffset = (first.getDay() + 6) % 7;
  const totalDays = new Date(year, month + 1, 0).getDate();
  const cells: Array<Date | null> = Array.from({ length: startOffset }, () => null);
  for (let day = 1; day <= totalDays; day += 1) cells.push(new Date(year, month, day, 12));
  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
}

function hasAvailabilityOnDate(date: Date, availability: MedicalAvailability[] = [], profile: Profile) {
  return (availability || []).some(slot =>
    slot.enabled
    && slot.weekday === date.getDay()
    && (canAccessClinical(profile) || slot.location_id === profile.location_id)
  );
}

function isHoliday(date: Date, holidays: Holiday[] = [], doctorId?: string | null) {
  const value = toDateInputValue(date);
  return (holidays || []).some(holiday => {
    if (!holiday.active || holiday.date !== value) return false;
    if (doctorId === undefined) return true;
    return !holiday.doctor_id || holiday.doctor_id === doctorId;
  });
}

function appointmentStatusLabel(status: AppointmentStatus) {
  const labels: Record<AppointmentStatus, string> = {
    PENDIENTE: "Pendiente",
    CONFIRMADO: "Confirmado",
    RECORDATORIO_ENVIADO: "Recordatorio enviado",
    CANCELADO: "Cancelado",
    AUSENTE: "Ausente"
  };
  return labels[status];
}

function appointmentStatusClass(status: AppointmentStatus) {
  return `status-${status.toLowerCase().replace(/_/g, "-")}`;
}

function Patients({ profile, selectedId, openNewKey, onSelect, onClose }: { profile: Profile; selectedId: string | null; openNewKey?: number; onSelect: (id: string) => void; onClose: () => void }) {
  const [patients, setPatients] = useState<Patient[]>([]);
  const [detail, setDetail] = useState<Patient | null>(null);
  const [query, setQuery] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [patientNotice, setPatientNotice] = useState("");
  const [loadError, setLoadError] = useState("");
  const [showInactive, setShowInactive] = useState(false);

  async function refresh() {
    try {
      setLoadError("");
      setPatients(await listPatients(query));
    } catch (err) {
      setPatients([]);
      setLoadError(err instanceof Error ? err.message : "No se pudo cargar la lista de pacientes.");
    }
  }

  useEffect(() => { refresh(); }, [query]);
  useEffect(() => { selectedId ? getPatient(selectedId).then(setDetail) : setDetail(null); }, [selectedId]);
  useEffect(() => { if (openNewKey) setShowForm(true); }, [openNewKey]);

  const visiblePatients = patients.filter(patient => showInactive || patient.status !== "baja");
  const inactiveCount = patients.filter(patient => patient.status === "baja").length;

  if (selectedId && detail) return <PatientChart patient={detail} profile={profile} notice={patientNotice} onBack={() => { setPatientNotice(""); onClose(); }} />;

  return (
    <Page title="Pacientes" subtitle="Buscar y abrir ficha clinica" actions={<button className="primary" onClick={() => setShowForm(value => !value)}>+ Nuevo paciente</button>}>
      {showForm && <PatientForm onCreated={async patient => {
        setShowForm(false);
        setPatientNotice(patient.linked_existing ? "El paciente ya estaba registrado. Se abrio su ficha unica." : "");
        await refresh();
        onSelect(patient.id);
      }} />}
      <div className="patient-list-toolbar">
        <input className="search" placeholder="Nombre, documento o telefono" value={query} onChange={e => setQuery(e.target.value)} />
        <button type="button" className={showInactive ? "secondary-action active-filter" : "secondary-action"} onClick={() => setShowInactive(value => !value)}>
          {showInactive ? "Ocultar dados de baja" : `Ver dados de baja (${inactiveCount})`}
        </button>
      </div>
      {loadError && <p className="error">No se pudieron cargar los pacientes: {loadError}</p>}
      <div className="list patient-list">
        {visiblePatients.map(p => (
          <PatientSearchCard key={p.id} patient={p} onValidated={refresh} onOpen={() => { setPatientNotice(""); onSelect(p.id); }} />
        ))}
        {!loadError && visiblePatients.length === 0 && <p className="empty-day">{patients.length ? "No hay pacientes activos en esta vista." : "No hay pacientes cargados."}</p>}
      </div>
    </Page>
  );
}

function PatientSearchCard({ patient, onOpen, onValidated }: { patient: Patient; onOpen: () => void; onValidated: () => Promise<void> }) {
  const lastVisit = getLastPatientVisit(patient);
  const whatsapp = buildWhatsappUrl(patient.phone, `Hola ${patient.first_name}, le escribimos del consultorio.`);
  const mail = patient.email ? `mailto:${patient.email}?subject=${encodeURIComponent("Consultorio cardiologia")}` : "";
  const [copied, setCopied] = useState(false);
  async function copyDocument() {
    const value = patient.document || "";
    if (!value) return;
    await navigator.clipboard.writeText(value);
    setCopied(true); window.setTimeout(() => setCopied(false), 1500);
  }

  return (
    <article className={`patient-card ${patient.status === "baja" ? "is-inactive" : ""}`}>
      <div className="patient-card-main">
        <button className="patient-identity" onClick={onOpen}>
          <span className="avatar">{patient.last_name?.[0] || "P"}{patient.first_name?.[0] || ""}</span>
          <span>
            <strong>{patient.last_name}, {patient.first_name} {patient.status === "baja" && <em className="inactive-patient-badge">Dado de baja</em>} {patient.validation_status === "PENDIENTE" && <em className="pending-validation-badge">Pendiente de validacion</em>}</strong>
            <small className="patient-document-line">{formatPatientDocument(patient)}{patient.document && <span role="button" tabIndex={0} className="copy-document-button icon-only" title={copied ? "Copiado" : "Copiar número de documento"} aria-label={`Copiar documento de ${patient.first_name} ${patient.last_name}`} onClick={event => { event.stopPropagation(); void copyDocument(); }} onKeyDown={event => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); event.stopPropagation(); void copyDocument(); } }}>{copied ? <Check size={16} /> : <Copy size={16} />}</span>}</small>
          </span>
        </button>
        <div className="patient-quick-data">
          <span>{patient.insurance_plans?.name || "Sin obra social"}</span>
          <span>{lastVisit.date}</span>
          <span>{lastVisit.reason}</span>
        </div>
      </div>

      <div className="quick-actions">
        {patient.validation_status === "PENDIENTE" && <button className="validate-patient-action" onClick={async () => { await validateWebPatient(patient.id); await onValidated(); }}>Validar paciente</button>}
        <button className="open-patient" onClick={onOpen}>Abrir historia</button>
        <a className={patient.phone ? "" : "disabled-link"} href={whatsapp || undefined} target="_blank" rel="noreferrer">Enviar WhatsApp</a>
        <a className={patient.email ? "" : "disabled-link"} href={mail || undefined}>Enviar email</a>
      </div>
    </article>
  );
}

function InsurancePlanPicker({
  plans,
  value,
  onChange,
  onCreated
}: {
  plans: InsurancePlan[];
  value: string;
  onChange: (id: string) => void;
  onCreated: (plan: InsurancePlan) => void;
}) {
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const activePlans = plans.filter(plan => plan.active);

  async function addPlan() {
    const cleanName = name.trim();
    if (!cleanName) return setError("Escribi el nombre de la obra social.");

    const existing = activePlans.find(plan => plan.name.localeCompare(cleanName, "es", { sensitivity: "base" }) === 0);
    if (existing) {
      onChange(existing.id);
      setName("");
      setAdding(false);
      setError("");
      return;
    }

    setSaving(true);
    setError("");
    try {
      const plan = await createInsurancePlan({ name: cleanName, active: true });
      onCreated(plan);
      onChange(plan.id);
      setName("");
      setAdding(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo agregar la obra social.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="insurance-picker">
      <label>Obra social
        <div className="insurance-picker-row">
          <select value={value} onChange={event => onChange(event.target.value)}>
            <option value="">Sin obra social</option>
            {activePlans.map(plan => <option key={plan.id} value={plan.id}>{plan.name}</option>)}
          </select>
          <button type="button" className="secondary-action" onClick={() => { setAdding(current => !current); setError(""); }}>
            {adding ? "Cancelar" : "+ Nueva"}
          </button>
        </div>
      </label>
      {adding && (
        <div className="inline-plan-form">
          <input
            value={name}
            onChange={event => setName(event.target.value)}
            onKeyDown={event => {
              if (event.key === "Enter") {
                event.preventDefault();
                void addPlan();
              }
            }}
            placeholder="Nombre de la nueva obra social"
            autoFocus
          />
          <button type="button" className="primary" disabled={saving} onClick={() => void addPlan()}>
            {saving ? "Agregando..." : "Agregar"}
          </button>
          {error && <p className="error">{error}</p>}
        </div>
      )}
    </div>
  );
}

function IdentityDocumentFields({ value, onChange }: { value: PatientInput; onChange: (next: PatientInput) => void }) {
  const documentType = value.document_type || "DNI";
  const numeric = ["DNI", "LC", "LE"].includes(documentType);

  return <>
    <label>Tipo de documento
      <select value={documentType} onChange={event => onChange({ ...value, document_type: event.target.value as IdentityDocumentType, document: "" })}>
        {documentTypeOptions.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
      </select>
    </label>
    <label>Numero de documento
      <input
        value={formatDocumentNumber(documentType, value.document, "")}
        onChange={event => onChange({ ...value, document: normalizeDocumentNumber(documentType, event.target.value) })}
        inputMode={numeric ? "numeric" : "text"}
        maxLength={numeric ? 12 : 24}
      />
    </label>
  </>;
}

function PatientForm({ onCreated }: { onCreated: (patient: Patient) => Promise<void> }) {
  const [config, setConfig] = useState<{ insurancePlans: InsurancePlan[] } | null>(null);
  const [form, setForm] = useState<PatientInput>({
    first_name: "",
    last_name: "",
    document_type: "DNI",
    document: "",
    birth_date: "",
    phone: "",
    email: "",
    affiliate_number: "",
    insurance_plan_id: ""
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => { getConfiguration().then(data => setConfig({ insurancePlans: data.insurancePlans })); }, []);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!form.first_name.trim() || !form.last_name.trim()) {
      setError("Nombre y apellido son obligatorios.");
      return;
    }
    if (!normalizeDocumentNumber(form.document_type || "DNI", form.document)) {
      setError("El numero de documento es obligatorio para evitar pacientes duplicados.");
      return;
    }
    try {
      parseBirthDate(form.birth_date);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Fecha de nacimiento invalida.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const patient = await createPatient(form);
      await onCreated(patient);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo crear el paciente.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form className="panel form-card" onSubmit={submit}>
      <h2>Nuevo paciente</h2>
      <div className="form-grid">
        <label>Nombre<input value={form.first_name} onChange={e => setForm({ ...form, first_name: e.target.value })} onBlur={() => setForm(current => ({ ...current, first_name: formatProperName(current.first_name) }))} /></label>
        <label>Apellido<input value={form.last_name} onChange={e => setForm({ ...form, last_name: e.target.value })} onBlur={() => setForm(current => ({ ...current, last_name: formatProperName(current.last_name) }))} /></label>
        <IdentityDocumentFields value={form} onChange={setForm} />
        <label>Fecha nacimiento<input value={form.birth_date} onChange={e => setForm({ ...form, birth_date: formatBirthDateInput(e.target.value) })} placeholder="dd/mm/yyyy" inputMode="numeric" maxLength={10} /></label>
        <label>Telefono WhatsApp<input value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} placeholder="549..." /></label>
        <label>Email<input value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} /></label>
        <InsurancePlanPicker
          plans={config?.insurancePlans || []}
          value={form.insurance_plan_id || ""}
          onChange={insurancePlanId => setForm(current => ({ ...current, insurance_plan_id: insurancePlanId }))}
          onCreated={plan => setConfig(current => current ? {
            ...current,
            insurancePlans: [...current.insurancePlans, plan].sort((a, b) => a.name.localeCompare(b.name, "es"))
          } : current)}
        />
        <label>Nro. afiliado<input value={form.affiliate_number} onChange={e => setForm({ ...form, affiliate_number: e.target.value })} /></label>
      </div>
      {error && <p className="error">{error}</p>}
      <div className="form-actions"><button className="primary" disabled={saving}>{saving ? "Guardando..." : "Guardar paciente"}</button></div>
    </form>
  );
}

function AppointmentForm({
  profile,
  appointments,
  initial,
  onEditAppointment,
  onCreated,
  onCancel
}: {
  profile: Profile;
  appointments: Appointment[];
  initial?: { starts_at: string; location_id: string; duration_min: number };
  onEditAppointment: (appointment: Appointment) => void;
  onCreated: () => Promise<void>;
  onCancel?: () => void;
}) {
  const [patients, setPatients] = useState<Patient[]>([]);
  const [config, setConfig] = useState<{ locations: Location[]; insurancePlans: InsurancePlan[]; availability: MedicalAvailability[] } | null>(null);
  const [patientMode, setPatientMode] = useState<"existente" | "nuevo">("existente");
  const [selectedLocationId, setSelectedLocationId] = useState(initial?.location_id || (profile.role === "SECRETARIA" ? profile.location_id || "" : ""));
  const [selectedDate, setSelectedDate] = useState(initial?.starts_at ? initial.starts_at.slice(0, 10) : toDateInputValue(new Date()));
  const [form, setForm] = useState({
    starts_at: initial?.starts_at || "",
    duration_min: initial?.duration_min || 15,
    types: ["CONSULTA"] as AppointmentTypeCode[],
    reason: "",
    patient_id: "",
    location_id: initial?.location_id || ""
  });
  const [newPatient, setNewPatient] = useState<PatientInput>({
    first_name: "",
    last_name: "",
    document_type: "DNI",
    document: "",
    birth_date: "",
    phone: "",
    email: "",
    affiliate_number: "",
    insurance_plan_id: "",
    location_id: initial?.location_id || profile.location_id || ""
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [patientSearch, setPatientSearch] = useState("");

  useEffect(() => {
    listPatients().then(setPatients);
    getConfiguration().then(data => setConfig({ locations: data.locations, insurancePlans: data.insurancePlans, availability: data.availability }));
  }, []);

  const activeLocations = (config?.locations || []).filter(location => location.active && (canAccessClinical(profile) || location.id === profile.location_id));
  const selectedLocation = activeLocations.find(location => location.id === selectedLocationId) || null;
  const availableSlots = getEligibleAvailability(profile, config?.availability || []).filter(slot => slot.location_id === selectedLocationId);
  const matchingAvailability = findAvailabilityForAppointment(form.starts_at, form.duration_min, availableSlots);
  const availabilityMessage = getAvailabilityMessage(form.starts_at, form.duration_min, availableSlots);
  const visualSlots = selectedLocationId ? buildLocationDaySlots(selectedDate, selectedLocationId, availableSlots, appointments) : [];
  const activePatients = patients.filter(patient => patient.status !== "baja");
  const normalizedPatientSearch = patientSearch.trim().toLocaleLowerCase("es");
  const filteredPatients = normalizedPatientSearch
    ? activePatients.filter(patient => `${patient.last_name} ${patient.first_name} ${patient.document || ""}`.toLocaleLowerCase("es").includes(normalizedPatientSearch))
    : activePatients;
  const selectedPatient = activePatients.find(patient => patient.id === form.patient_id);
  const appointmentReady = Boolean(selectedLocationId && form.starts_at && (patientMode === "existente" ? form.patient_id : newPatient.first_name?.trim() && newPatient.last_name?.trim() && newPatient.document?.trim()));

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!selectedLocationId) return setError("Elegir consultorio.");
    if (!form.starts_at) return setError("Fecha y hora son obligatorias.");
    if (matchingAvailability.status === "none") return setError("Ese dia y horario no coinciden con ningun consultorio configurado.");
    if (matchingAvailability.status === "ambiguous") return setError("Hay mas de un consultorio configurado en ese mismo horario. Revisar Ajustes > Disponibilidad medica.");
    if (patientMode === "existente" && !form.patient_id) return setError("Elegi un paciente o carga uno nuevo.");
    if (patientMode === "nuevo" && (!newPatient.first_name?.trim() || !newPatient.last_name?.trim())) return setError("Nombre y apellido del paciente nuevo son obligatorios.");
    if (patientMode === "nuevo" && !normalizeDocumentNumber(newPatient.document_type || "DNI", newPatient.document)) return setError("El numero de documento es obligatorio para evitar pacientes duplicados.");
    try {
      parseBirthDate(newPatient.birth_date);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Fecha de nacimiento invalida.");
      return;
    }

    setSaving(true);
    setError("");
    try {
      const locationId = matchingAvailability.slot.location_id;
      let patientId = form.patient_id;
      if (patientMode === "nuevo") {
        const created = await createPatient({ ...newPatient, location_id: locationId });
        patientId = created.id;
      }
      const appointmentPayload = buildAppointmentTypePayload(form.types, form.reason);
      await createAppointment({ ...form, ...appointmentPayload, patient_id: patientId, location_id: locationId });
      await onCreated();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo crear el turno.");
    } finally {
      setSaving(false);
    }
  }

  function focusPatientSection() {
    window.setTimeout(() => {
      document.getElementById("appointment-patient-section")?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 0);
  }

  function chooseFreeSlot(startsAt: string, jumpToPatient = false) {
    setForm({ ...form, starts_at: startsAt, location_id: selectedLocationId });
    if (jumpToPatient) focusPatientSection();
  }

  return (
    <form className="panel form-card" onSubmit={submit}>
      <div className="appointment-form-heading">
        <div><span>Nuevo turno</span><h2>Completa los datos en 3 pasos</h2></div>
        <ol aria-label="Progreso del turno">
          <li className={selectedLocationId ? "done" : "active"}>Agenda</li>
          <li className={form.starts_at ? "done" : selectedLocationId ? "active" : ""}>Horario</li>
          <li className={appointmentReady ? "done" : form.starts_at ? "active" : ""}>Paciente</li>
        </ol>
      </div>
      <h3 className="appointment-step-title"><span>1</span> Agenda y motivo</h3>
      <div className="segmented">
        <button type="button" className={patientMode === "existente" ? "active" : ""} onClick={() => setPatientMode("existente")}>Paciente existente</button>
        <button type="button" className={patientMode === "nuevo" ? "active" : ""} onClick={() => setPatientMode("nuevo")}>Paciente nuevo</button>
      </div>
      <div className="form-grid">
        {!initial ? <label>Agenda / consultorio
          <select value={selectedLocationId} onChange={e => { setSelectedLocationId(e.target.value); setForm({ ...form, starts_at: "", location_id: e.target.value }); setNewPatient({ ...newPatient, location_id: e.target.value }); }} disabled={profile.role === "SECRETARIA"}>
            <option value="">Elegir agenda</option>
            {activeLocations.map(location => <option key={location.id} value={location.id}>{location.name}</option>)}
          </select>
        </label> : <div className="locked-agenda"><span>Agenda</span><strong>{selectedLocation?.name || "Consultorio asignado"}</strong></div>}
        <label>Fecha<input type="date" value={selectedDate} onChange={e => { setSelectedDate(e.target.value); setForm({ ...form, starts_at: "" }); }} /></label>
        <AppointmentTypePicker value={form.types} onChange={types => setForm({ ...form, types })} />
        <label>Duracion
          <select value={form.duration_min} onChange={e => setForm({ ...form, duration_min: Number(e.target.value) })}>
            {durationOptions().map(value => <option key={value} value={value}>{value} minutos</option>)}
          </select>
        </label>
        <label>Detalle / observacion<input value={form.reason} onChange={e => setForm({ ...form, reason: e.target.value })} placeholder="Control, retiro de equipo, indicacion breve..." /></label>
      </div>

      <div className="slot-picker">
        <div className="slot-picker-head">
          <strong><span className="step-number">2</span> Elegí un horario libre</strong>
          <span>{form.starts_at ? `Seleccionado ${new Date(form.starts_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}` : "Click libre selecciona · doble click avanza · ocupado edita"}</span>
        </div>
        <div className="slot-picker-grid">
          {!selectedLocationId && <p className="empty-day">Elegir consultorio para ver horarios.</p>}
          {selectedLocationId && visualSlots.length === 0 && <p className="empty-day">No hay atencion configurada para ese dia.</p>}
          {visualSlots.map(slot => (
            <button
              key={slot.key}
              type="button"
              className={slot.appointment ? "pick-slot occupied" : form.starts_at === slot.startsAt ? "pick-slot selected" : "pick-slot free"}
              onClick={() => slot.appointment ? onEditAppointment(slot.appointment) : chooseFreeSlot(slot.startsAt)}
              onDoubleClick={() => slot.appointment ? onEditAppointment(slot.appointment) : chooseFreeSlot(slot.startsAt, true)}
              title={slot.appointment ? "Doble click para editar este turno" : "Doble click para elegir paciente"}
            >
              <strong>{slot.time}</strong>
              <span>{slot.appointment ? `${slot.appointment.patients?.last_name || ""}, ${slot.appointment.patients?.first_name || ""}` : "Libre"}</span>
            </button>
          ))}
        </div>
      </div>

      <p className={availabilityMessage?.startsWith("Consultorio:") ? "notice ok-notice" : "notice"}>{availabilityMessage}</p>

      <div id="appointment-patient-section" className="appointment-patient-section">
      <h3 className="appointment-step-title"><span>3</span> Paciente</h3>
      {patientMode === "existente" ? (
        <div className="patient-lookup">
        <label className="full-field">Buscar por apellido, nombre o DNI
          <input value={patientSearch} onChange={e => setPatientSearch(e.target.value)} placeholder="Empezá a escribir para acotar la lista" autoComplete="off" />
        </label>
        <label className="full-field">Seleccionar paciente
          <select value={form.patient_id} onChange={e => setForm({ ...form, patient_id: e.target.value })}>
            <option value="">Elegir paciente</option>
            {filteredPatients.map(patient => <option key={patient.id} value={patient.id}>{patient.last_name}, {patient.first_name} - {formatPatientDocument(patient, "s/d")}</option>)}
          </select>
        </label>
        {selectedPatient && <div className="selected-patient-summary"><span>Paciente seleccionado</span><strong>{selectedPatient.last_name}, {selectedPatient.first_name}</strong><small>{formatPatientDocument(selectedPatient)}</small></div>}
        </div>
      ) : (
        <div className="form-grid nested-form">
          <label>Nombre<input value={newPatient.first_name} onChange={e => setNewPatient({ ...newPatient, first_name: e.target.value })} onBlur={() => setNewPatient(current => ({ ...current, first_name: formatProperName(current.first_name) }))} /></label>
          <label>Apellido<input value={newPatient.last_name} onChange={e => setNewPatient({ ...newPatient, last_name: e.target.value })} onBlur={() => setNewPatient(current => ({ ...current, last_name: formatProperName(current.last_name) }))} /></label>
          <IdentityDocumentFields value={newPatient} onChange={setNewPatient} />
          <label>Fecha nacimiento<input value={newPatient.birth_date} onChange={e => setNewPatient({ ...newPatient, birth_date: formatBirthDateInput(e.target.value) })} placeholder="dd/mm/yyyy" inputMode="numeric" maxLength={10} /></label>
          <label>Telefono WhatsApp<input value={newPatient.phone} onChange={e => setNewPatient({ ...newPatient, phone: e.target.value })} placeholder="549..." /></label>
          <label>Email<input value={newPatient.email} onChange={e => setNewPatient({ ...newPatient, email: e.target.value })} /></label>
          <InsurancePlanPicker
            plans={config?.insurancePlans || []}
            value={newPatient.insurance_plan_id || ""}
            onChange={insurancePlanId => setNewPatient(current => ({ ...current, insurance_plan_id: insurancePlanId }))}
            onCreated={plan => setConfig(current => current ? {
              ...current,
              insurancePlans: [...current.insurancePlans, plan].sort((a, b) => a.name.localeCompare(b.name, "es"))
            } : current)}
          />
          <label>Nro. afiliado<input value={newPatient.affiliate_number} onChange={e => setNewPatient({ ...newPatient, affiliate_number: e.target.value })} /></label>
        </div>
      )}
      </div>

      {error && <p className="error">{error}</p>}
      <div className={`appointment-review ${appointmentReady ? "ready" : ""}`}>
        <strong>{appointmentReady ? "Turno listo para guardar" : "Faltan datos para guardar"}</strong>
        <span>{selectedLocation?.name || "Elegí una agenda"}</span>
        <span>{form.starts_at ? new Date(form.starts_at).toLocaleString("es-AR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : "Elegí fecha y horario"}</span>
        <span>{patientMode === "existente" ? selectedPatient ? `${selectedPatient.last_name}, ${selectedPatient.first_name}` : "Elegí un paciente" : newPatient.first_name && newPatient.last_name ? `${newPatient.last_name}, ${newPatient.first_name}` : "Completá el paciente nuevo"}</span>
      </div>
      <div className="form-actions">
        {onCancel && <button type="button" className="secondary-action" onClick={onCancel}>Cerrar</button>}
        <button className="primary" disabled={saving || !appointmentReady}>{saving ? "Guardando..." : "Confirmar y guardar turno"}</button>
      </div>
    </form>
  );
}

function AppointmentEditForm({
  appointment,
  availability,
  profile,
  onSaved,
  onCancel
}: {
  appointment: Appointment;
  availability: MedicalAvailability[];
  profile: Profile;
  onSaved: () => Promise<void>;
  onCancel: () => void;
}) {
  const [config, setConfig] = useState<{ locations: Location[]; insurancePlans: InsurancePlan[]; availability: MedicalAvailability[] } | null>(null);
  const [form, setForm] = useState({
    starts_at: toDatetimeLocal(new Date(appointment.starts_at)),
    duration_min: appointment.duration_min,
    types: decodeAppointmentTypes(appointmentTypeValue(appointment)),
    reason: visibleAppointmentReason(appointment.reason),
    status: appointment.status as AppointmentStatus,
    patient_id: appointment.patient_id,
    location_id: appointment.location_id
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    getConfiguration().then(data => setConfig({ locations: data.locations, insurancePlans: data.insurancePlans, availability: data.availability }));
  }, []);

  const slots = getEligibleAvailability(profile, config?.availability || availability);
  const matchingAvailability = findAvailabilityForAppointment(form.starts_at, form.duration_min, slots);
  const availabilityMessage = getAvailabilityMessage(form.starts_at, form.duration_min, slots);

  async function save(nextStatus?: AppointmentStatus) {
    const status = nextStatus || form.status;
    if (!form.starts_at) return setError("Fecha y hora son obligatorias.");
    if (status !== "CANCELADO" && matchingAvailability.status === "none") {
      return setError("Ese dia y horario no coinciden con ningun consultorio configurado.");
    }
    if (status !== "CANCELADO" && matchingAvailability.status === "ambiguous") {
      return setError("Hay mas de un consultorio configurado en ese mismo horario. Revisar Ajustes > Disponibilidad medica.");
    }
    const locationId = status === "CANCELADO" || matchingAvailability.status !== "match" ? form.location_id : matchingAvailability.slot.location_id;

    setSaving(true);
    setError("");
    try {
      await updateAppointment(appointment.id, {
        ...form,
        ...buildAppointmentTypePayload(form.types, form.reason),
        status,
        location_id: locationId
      });
      await onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo modificar el turno.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form className="panel form-card" onSubmit={event => { event.preventDefault(); save(); }}>
      <h2>Modificar turno</h2>
      <p className="muted-line">
        {appointment.patients?.last_name}, {appointment.patients?.first_name} · {appointment.patients ? formatPatientDocument(appointment.patients, "s/d") : "s/d"}
      </p>
      <div className="form-grid">
        <label>Fecha y hora<input type="datetime-local" value={form.starts_at} onChange={e => setForm({ ...form, starts_at: e.target.value })} /></label>
        <AppointmentTypePicker value={form.types} onChange={types => setForm({ ...form, types })} />
        <label>Duracion
          <select value={form.duration_min} onChange={e => setForm({ ...form, duration_min: Number(e.target.value) })}>
            {durationOptions().map(value => <option key={value} value={value}>{value} minutos</option>)}
          </select>
        </label>
        <label>Estado
          <select value={form.status} onChange={e => setForm({ ...form, status: e.target.value as AppointmentStatus })}>
            <option value="PENDIENTE">Pendiente</option>
            <option value="CONFIRMADO">Confirmado</option>
            <option value="RECORDATORIO_ENVIADO">Recordatorio enviado</option>
            <option value="CANCELADO">Cancelado</option>
            <option value="AUSENTE">Ausente</option>
          </select>
        </label>
        <label>Detalle / observacion<input value={form.reason} onChange={e => setForm({ ...form, reason: e.target.value })} /></label>
      </div>

      {form.status !== "CANCELADO" && <p className={availabilityMessage?.startsWith("Consultorio:") ? "notice ok-notice" : "notice"}>{availabilityMessage}</p>}
      {error && <p className="error">{error}</p>}

      <div className="form-actions appointment-edit-actions">
        <button type="button" className="secondary-action" onClick={onCancel}>Cerrar</button>
        <button type="button" className="danger-action" disabled={saving} onClick={() => save("CANCELADO")}>Cancelar turno</button>
        <button className="primary" disabled={saving}>{saving ? "Guardando..." : "Guardar cambios"}</button>
      </div>
    </form>
  );
}

function getEligibleAvailability(profile: Profile, slots: MedicalAvailability[]) {
  return slots.filter(slot => {
    if (!slot.enabled) return false;
    if (profile.role === "SECRETARIA") return slot.location_id === profile.location_id;
    if (profile.is_master || profile.role === "ADMINISTRADOR") return true;
    const professionalId = profile.simulated_professional_id || profile.id;
    return !slot.doctor_id || slot.doctor_id === professionalId;
  });
}

type AvailabilityMatch =
  | { status: "match"; slot: MedicalAvailability }
  | { status: "none" }
  | { status: "ambiguous"; slots: MedicalAvailability[] };

function findAvailabilityForAppointment(startsAt: string, durationMin: number, slots: MedicalAvailability[]): AvailabilityMatch {
  if (!startsAt) return { status: "none" };
  const date = new Date(startsAt);
  const weekday = date.getDay();
  const minutes = date.getHours() * 60 + date.getMinutes();
  const matches = slots.filter(slot => slot.weekday === weekday && minutes >= timeToMinutes(slot.start_time) && minutes + durationMin <= timeToMinutes(slot.end_time));
  if (matches.length === 0) return { status: "none" };
  if (matches.length > 1) return { status: "ambiguous", slots: matches };
  return { status: "match", slot: matches[0] };
}

function getAvailabilityMessage(startsAt: string, durationMin: number, slots: MedicalAvailability[]) {
  if (!slots.length) return "No hay disponibilidad medica configurada.";
  const summary = slots.map(slot => `${slot.locations?.name || "Consultorio"}: ${weekdayName(slot.weekday)} ${slot.start_time}-${slot.end_time}`).join("; ");
  if (!startsAt) return `Elegir fecha y hora. Horarios configurados: ${summary}`;
  const match = findAvailabilityForAppointment(startsAt, durationMin, slots);
  if (match.status === "match") return `Consultorio: ${match.slot.locations?.name || "Consultorio"} · ${weekdayName(match.slot.weekday)} ${match.slot.start_time}-${match.slot.end_time}`;
  if (match.status === "ambiguous") return "Horario superpuesto en mas de un consultorio. Revisar disponibilidad medica.";
  return `Fuera de horario. Horarios configurados: ${summary}`;
}

function timeToMinutes(value: string) {
  if (!value || !value.includes(":")) return 0;
  const [hours, minutes] = value.split(":").map(Number);
  return hours * 60 + minutes;
}

function getSlotInterval(slot: MedicalAvailability) {
  const value = Number(slot.slot_interval_min || 15);
  return value >= 5 && value <= 60 ? value : 15;
}

function durationOptions() {
  return Array.from({ length: 12 }, (_, index) => (index + 1) * 5);
}

function weekdayName(value: number) {
  return ["Dom", "Lun", "Mar", "Mie", "Jue", "Vie", "Sab"][value] || "Dia";
}

function formatBirthDate(value?: string | null) {
  if (!value) return "-";
  const match = value.match(/^(\d{4,5})-(\d{2})-(\d{2})/);
  if (!match) return value;
  const year = match[1].slice(-4);
  return `${match[3]}/${match[2]}/${year}`;
}

function formatPatientDocument(patient: Pick<Patient, "document_type" | "document">, emptyValue = "-") {
  const type = patient.document_type || "DNI";
  const number = formatDocumentNumber(type, patient.document, emptyValue);
  return number === emptyValue ? emptyValue : `${documentTypeLabel(type)} ${number}`;
}

function patientConsultorios(patient: Patient) {
  const linked = (patient.patient_locations || []).map(item => item.locations?.name).filter((name): name is string => Boolean(name));
  return [...new Set(linked)].join(", ") || "Sin consultorio";
}

function buildWhatsappUrl(phone?: string | null, text = "") {
  const digits = (phone || "").replace(/\D/g, "");
  if (!digits) return "";
  return `https://wa.me/${digits}?text=${encodeURIComponent(text)}`;
}

function toDatetimeLocal(date: Date) {
  return `${toDateInputValue(date)}T${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

function shiftDate(value: string, days: number) {
  const date = new Date(`${value}T12:00:00`);
  date.setDate(date.getDate() + days);
  return toDateInputValue(date);
}

function getWeekDays(value: string) {
  const date = new Date(`${value}T12:00:00`);
  const mondayOffset = (date.getDay() + 6) % 7;
  date.setDate(date.getDate() - mondayOffset);
  return Array.from({ length: 7 }, (_, index) => {
    const day = new Date(date);
    day.setDate(date.getDate() + index);
    return day;
  });
}

function sameLocalDate(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

type AgendaSlot = {
  key: string;
  time: string;
  startsAt: string;
  locationId: string;
  durationMin: number;
  locationName: string;
  appointment?: Appointment;
};

function buildAgendaSlots(day: Date, availability: MedicalAvailability[], appointments: Appointment[], profile: Profile, holidays: Holiday[] = []): AgendaSlot[] {
  if (isHoliday(day, holidays, null)) return [];
  const slots = availability
    .filter(slot => slot.enabled && slot.weekday === day.getDay())
    .filter(slot => !isHoliday(day, holidays, slot.doctor_id))
    .filter(slot => canAccessClinical(profile) || slot.location_id === profile.location_id)
    .flatMap(slot => {
      const start = timeToMinutes(slot.start_time);
      const end = timeToMinutes(slot.end_time);
      const items = [];
      const interval = getSlotInterval(slot);
      for (let minute = start; minute < end; minute += interval) {
        const date = new Date(day);
        date.setHours(Math.floor(minute / 60), minute % 60, 0, 0);
        const appointment = appointments.find(item => item.status !== "CANCELADO" && item.location_id === slot.location_id && (!item.doctor_id || !slot.doctor_id || item.doctor_id === slot.doctor_id) && minutesOverlap(date, interval, new Date(item.starts_at), item.duration_min));
        items.push({
          key: `${slot.id}-${minute}`,
          time: `${String(Math.floor(minute / 60)).padStart(2, "0")}:${String(minute % 60).padStart(2, "0")}`,
          startsAt: toDatetimeLocal(date),
          locationId: slot.location_id,
          durationMin: interval,
          locationName: slot.locations?.name || "Consultorio",
          appointment
        });
      }
      return items;
    });

  return slots.sort((a, b) => a.time.localeCompare(b.time) || a.locationName.localeCompare(b.locationName));
}

function buildLocationDaySlots(selectedDate: string, locationId: string, availability: MedicalAvailability[], appointments: Appointment[]) {
  if (!selectedDate || !locationId) return [];
  const day = new Date(`${selectedDate}T12:00:00`);
  const dayAppointments = appointments
    .filter(appointment => appointment.status !== "CANCELADO" && appointment.location_id === locationId && sameLocalDate(new Date(appointment.starts_at), day));

  return availability
    .filter(slot => slot.enabled && slot.location_id === locationId && slot.weekday === day.getDay())
    .flatMap(slot => {
      const start = timeToMinutes(slot.start_time);
      const end = timeToMinutes(slot.end_time);
      const items = [];
      const interval = getSlotInterval(slot);
      for (let minute = start; minute < end; minute += interval) {
        const date = new Date(day);
        date.setHours(Math.floor(minute / 60), minute % 60, 0, 0);
        const appointment = dayAppointments.find(item => (!item.doctor_id || !slot.doctor_id || item.doctor_id === slot.doctor_id) && minutesOverlap(date, interval, new Date(item.starts_at), item.duration_min));
        items.push({
          key: `${slot.id}-${minute}`,
          time: `${String(Math.floor(minute / 60)).padStart(2, "0")}:${String(minute % 60).padStart(2, "0")}`,
          startsAt: toDatetimeLocal(date),
          durationMin: interval,
          appointment
        });
      }
      return items;
    })
    .sort((a, b) => a.time.localeCompare(b.time));
}

function minutesOverlap(slotStart: Date, slotDuration: number, appointmentStart: Date, appointmentDuration: number) {
  const slotFrom = slotStart.getTime();
  const slotTo = slotFrom + slotDuration * 60_000;
  const appointmentFrom = appointmentStart.getTime();
  const appointmentTo = appointmentFrom + appointmentDuration * 60_000;
  return slotFrom < appointmentTo && appointmentFrom < slotTo;
}

function getLastPatientVisit(patient: Patient) {
  const clinical = (patient.clinical_evolutions || [])
    .map(evolution => ({ date: evolution.occurred_at, reason: evolution.reason }))
    .filter(item => item.date);
  const appointmentVisits = (patient.appointments || [])
    .filter(appointment => new Date(appointment.starts_at).getTime() <= Date.now() && appointment.status !== "CANCELADO")
    .map(appointment => ({ date: appointment.starts_at, reason: visibleAppointmentReason(appointment.reason) || appointmentTypeLabel(appointmentTypeValue(appointment)) }));
  const visits = [...clinical, ...appointmentVisits].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  const last = visits[0];

  if (!last) return { date: "Sin visitas", reason: "Sin motivo registrado" };
  return {
    date: `Ultima visita ${new Date(last.date).toLocaleDateString()}`,
    reason: last.reason || "Sin motivo registrado"
  };
}

function PatientChart({ patient, profile, notice, onBack }: { patient: Patient; profile: Profile; notice?: string; onBack: () => void }) {
  const [currentPatient, setCurrentPatient] = useState(patient);
  const [panel, setPanel] = useState<"historia" | "datos" | "adjuntos" | "nota" | "enviar">("historia");
  const [showDocumentGenerator, setShowDocumentGenerator] = useState(false);
  const [historyProfessionalId, setHistoryProfessionalId] = useState("all");
  const [historyOrder, setHistoryOrder] = useState<"desc" | "asc">("desc");
  const [showEvolutionForm, setShowEvolutionForm] = useState(false);
  const clinicalHistory = [...(currentPatient.clinical_evolutions || [])].sort((a, b) => new Date(b.occurred_at).getTime() - new Date(a.occurred_at).getTime());
  const historyProfessionals = Array.from(new Map(clinicalHistory.filter(item => item.author).map(item => [item.created_by || item.author!.id, item.author!])).entries());
  const visibleClinicalHistory = historyProfessionalId === "all" ? clinicalHistory : clinicalHistory.filter(item => (item.created_by || item.author?.id) === historyProfessionalId);
  const printablePatient = historyProfessionalId === "all" ? currentPatient : { ...currentPatient, clinical_evolutions: visibleClinicalHistory };
  const clinicalTimelineItems = [
    ...visibleClinicalHistory.map(item => ({ id: `e-${item.id}`, date: item.occurred_at, kind: "evolution" as const, evolution: item })),
    ...(currentPatient.studies || []).map(item => ({ id: `s-${item.id}`, date: item.performed_at || "", kind: "study" as const, study: item })).filter(item => item.date),
    ...(currentPatient.attachments || []).map(item => ({ id: `a-${item.id}`, date: item.created_at, kind: "attachment" as const, attachment: item })),
    ...(currentPatient.appointments || []).filter(item => item.status !== "CANCELADO" && new Date(item.starts_at).getTime() <= Date.now()).map(item => ({ id: `t-${item.id}`, date: item.starts_at, kind: "appointment" as const, appointment: item }))
  ].sort((a, b) => (historyOrder === "asc" ? 1 : -1) * (new Date(a.date).getTime() - new Date(b.date).getTime()));

  async function refresh() {
    setCurrentPatient(await getPatient(patient.id));
  }

  async function togglePatientStatus() {
    const activate = currentPatient.status === "baja";
    const question = activate
      ? "Reactivar este paciente?"
      : "Dar de baja este paciente? No se borra la historia, solo queda inactivo.";
    if (!window.confirm(question)) return;
    await setPatientActive(currentPatient.id, activate);
    await refresh();
  }

  return (
    <Page
      title={`${currentPatient.last_name}, ${currentPatient.first_name}`}
      subtitle="Ficha clinica del paciente"
      actions={
        <>
          {canAccessClinical(profile) && <button className="primary" onClick={() => void printClinicalHistory(printablePatient, profile)}>Imprimir historia</button>}
          {canAccessClinical(profile) && <button className="secondary-action" onClick={() => setShowDocumentGenerator(true)}>Generar documento PDF</button>}
          <button onClick={onBack}>Volver a pacientes</button>
        </>
      }
    >
      {showDocumentGenerator && <InstitutionalDocumentDialog patient={currentPatient} profile={profile} onClose={() => setShowDocumentGenerator(false)} />}
      {notice && <p className="notice ok-notice">{notice}</p>}
      {currentPatient.status === "baja" && <p className="notice">Paciente dado de baja. La historia queda conservada.</p>}
      <div className="clinical-actions">
        {canAccessClinical(profile) && <button className={panel === "historia" ? "primary" : ""} onClick={() => setPanel("historia")}>Historia clinica</button>}
        <button className={panel === "datos" ? "primary" : "secondary-action"} onClick={() => setPanel("datos")}>Editar datos</button>
        <button className={panel === "adjuntos" ? "primary" : "secondary-action"} onClick={() => setPanel("adjuntos")}>Adjuntar estudio</button>
        <button className={panel === "enviar" ? "primary" : "secondary-action"} onClick={() => setPanel("enviar")}>Enviar documentos</button>
        <button className={panel === "nota" ? "primary" : "secondary-action"} onClick={() => setPanel("nota")}>Nota administrativa</button>
        {canAccessClinical(profile) && <button className={currentPatient.status === "baja" ? "primary" : "danger-action"} onClick={() => void togglePatientStatus()}>{currentPatient.status === "baja" ? "Reactivar paciente" : "Dar de baja"}</button>}
      </div>

      <section className="summary">
        <div><span>Documento</span><strong>{formatPatientDocument(currentPatient)}</strong></div>
        <div><span>Edad</span><strong>{patientAge(currentPatient.birth_date)}</strong></div>
        <div><span>Telefono</span><strong>{currentPatient.phone || "-"}</strong></div>
        <div><span>Email</span><strong>{currentPatient.email || "-"}</strong></div>
        <div><span>Obra social</span><strong>{currentPatient.insurance_plans?.name || "-"}</strong></div>
        <div><span>Nro. afiliado</span><strong>{currentPatient.affiliate_number || "-"}</strong></div>
      </section>

      {panel === "datos" && <PatientContactForm patient={currentPatient} onSaved={refresh} />}
      {panel === "historia" && canAccessClinical(profile) && !isDoctorRole(profile.role) && <p className="notice">Vista de lectura. Cada evolución conserva la autoría y firma del profesional que la registró.</p>}
      {panel === "historia" && profile.role === "SECRETARIA" && <p className="notice">Las evoluciones clinicas, diagnosticos y notas medicas estan protegidas y no se muestran para secretaria.</p>}
      {panel === "adjuntos" && <AttachmentForm patient={currentPatient} onUploaded={refresh} />}
      {panel === "nota" && <AdministrativeNoteForm patient={currentPatient} onSaved={refresh} />}
      {panel === "enviar" && <DocumentShareForm patient={currentPatient} profile={profile} />}

      {panel === "enviar" && <ContactActions patient={currentPatient} profile={profile} />}

      {panel === "adjuntos" && <section className="patient-panel-section"><h2>Estudios y documentos adjuntos</h2><AttachmentList attachments={currentPatient.attachments || []} /></section>}
      {panel === "historia" && canAccessClinical(profile) && <section className="clinical-history-section">
        <header>
          <div><span>Historia clínica</span><h2>Línea de tiempo</h2><p>{visibleClinicalHistory.length} {visibleClinicalHistory.length === 1 ? "registro" : "registros"} · más reciente primero</p></div>
          <div className="clinical-history-actions">
            {isDoctorRole(profile.role) && !profile.simulated && <button className="primary" onClick={() => setShowEvolutionForm(value => !value)}>{showEvolutionForm ? "Cerrar carga" : "+ Nueva atención"}</button>}
            {canAccessClinical(profile) && <button className="secondary-action" onClick={() => void printClinicalHistory(printablePatient, profile)}>Imprimir historia</button>}
          </div>
        </header>
        {showEvolutionForm && isDoctorRole(profile.role) && !profile.simulated && <ClinicalEvolutionForm patient={currentPatient} onSaved={async () => { await refresh(); setShowEvolutionForm(false); }} />}
        {historyProfessionals.length > 1 && <div className="history-professional-filter" aria-label="Filtrar historia por profesional">
          <button type="button" className={historyProfessionalId === "all" ? "active" : ""} onClick={() => setHistoryProfessionalId("all")}>Todos los profesionales</button>
          {historyProfessionals.map(([id, author]) => <button type="button" key={id} className={historyProfessionalId === id ? "active" : ""} onClick={() => setHistoryProfessionalId(id)}>{author.full_name}</button>)}
        </div>}
        <div className="history-order-control"><span>Cronología</span><button type="button" className={historyOrder === "desc" ? "active" : ""} onClick={() => setHistoryOrder("desc")}>Más reciente</button><button type="button" className={historyOrder === "asc" ? "active" : ""} onClick={() => setHistoryOrder("asc")}>Desde el inicio</button></div>
        {profile.role === "SECRETARIA" && <p className="notice">Las evoluciones clinicas, diagnosticos y notas medicas estan protegidas por RLS y no se muestran para secretaria.</p>}
        {canAccessClinical(profile) && !clinicalHistory.length && <p className="empty-day">Todavía no hay evoluciones clínicas registradas.</p>}
        {canAccessClinical(profile) && <div className="clinical-timeline">{clinicalTimelineItems.map(item => <PatientTimelineEntry key={item.id} item={item} />)}</div>}
      </section>}
      {panel === "nota" && <section className="patient-panel-section"><h2>Notas administrativas</h2>{(currentPatient.administrative_notes || []).map(n => <article className="timeline" key={n.id}><strong>Nota administrativa</strong><p>{n.text}</p></article>)}</section>}
      {panel === "enviar" && <section className="patient-panel-section"><h2>Comunicaciones</h2>{(currentPatient.communications || []).map(c => <article className="timeline communication-timeline" key={c.id}><strong>{c.channel} · {(c.status||"ENVIADO_MANUAL").replace(/_/g," ")}</strong><small>{new Date(c.created_at||c.sent_at).toLocaleString("es-AR")}</small><p>{c.body}</p>{c.observation&&<p><b>Observacion:</b> {c.observation}</p>}</article>)}</section>}
    </Page>
  );
}

function printClinicalHistory(patient: Patient, profile: Profile) {
  void printInstitutionalPdf({ patient, profile, kind: "HISTORY" });
}

function NotificationBell({ onOpenPatient }: { onOpenPatient: (id: string) => void }) {
  const [alerts, setAlerts] = useState<CommunicationAlert[]>([]);
  const [open, setOpen] = useState(false);

  async function refresh() {
    setAlerts(await listCommunicationAlerts().catch(() => []));
  }

  useEffect(() => {
    void refresh();
    const timer = window.setInterval(() => void refresh(), 60000);
    return () => window.clearInterval(timer);
  }, []);

  return <div className="notification-center">
    <button type="button" className="notification-trigger" title="Avisos pendientes" aria-label={`${alerts.length} avisos pendientes`} onClick={() => setOpen(value => !value)}>
      <Bell size={20} />
      {alerts.length > 0 && <span>{alerts.length > 99 ? "99+" : alerts.length}</span>}
    </button>
    {open && <div className="notification-popover">
      <header><strong>Avisos</strong><button type="button" className="icon-only" aria-label="Cerrar avisos" onClick={() => setOpen(false)}>×</button></header>
      <div>
        {alerts.map((alert, index) => <button type="button" key={`${alert.kind}-${alert.appointment_id || alert.patient_id}-${index}`} onClick={() => { setOpen(false); onOpenPatient(alert.patient_id); }}>
          <strong>{alert.title}</strong>
          <small>{alert.detail}{alert.due_at ? ` · ${new Date(alert.due_at).toLocaleString("es-AR", { timeZone: "America/Argentina/Buenos_Aires", dateStyle: "short", timeStyle: "short" })}` : ""}</small>
        </button>)}
        {!alerts.length && <p>No hay avisos pendientes.</p>}
      </div>
    </div>}
  </div>;
}

type PatientTimelineItem =
  | { id: string; date: string; kind: "evolution"; evolution: ClinicalEvolution }
  | { id: string; date: string; kind: "study"; study: Study }
  | { id: string; date: string; kind: "attachment"; attachment: Attachment }
  | { id: string; date: string; kind: "appointment"; appointment: Appointment };

function PatientTimelineEntry({ item }: { item: PatientTimelineItem }) {
  const date = new Date(item.date);
  if (item.kind === "evolution") {
    const evolution = item.evolution;
    return <article className="clinical-entry timeline-evolution">
      <time dateTime={item.date}><strong>{date.toLocaleDateString("es-AR", { day: "2-digit", month: "short", year: "numeric" })}</strong><span>{date.toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" })}</span></time>
      <div className="clinical-entry-content"><span className="timeline-kind">Atención clínica</span><h3>{evolution.reason || "Consulta / evolución"}</h3>
        {evolution.author && <p className="clinical-entry-author"><b>{evolution.author.full_name}</b>{evolution.author.specialty || evolution.author.public_booking_specialty ? ` · ${evolution.author.specialty || evolution.author.public_booking_specialty}` : ""}{evolution.author.professional_license ? ` · M.P. ${evolution.author.professional_license.replace(/^M\.?P\.?\s*/i, "")}` : ""}</p>}
        {evolution.diagnosis && <section><span>Diagnóstico</span><p>{evolution.diagnosis}</p></section>}
        {evolution.notes && <section><span>Evolución</span><p>{evolution.notes}</p></section>}
        {evolution.indications && <section className="clinical-indications"><span>Indicaciones</span><p>{evolution.indications}</p></section>}
        {evolution.requested_studies && <section className="clinical-requested-studies"><span>Estudios solicitados</span><p>{evolution.requested_studies}</p></section>}
        {evolution.next_visit_at && <footer><b>Próximo control:</b> {new Date(`${evolution.next_visit_at}T12:00:00`).toLocaleDateString("es-AR")}</footer>}
      </div>
    </article>;
  }
  if (item.kind === "attachment") return <article className="clinical-entry timeline-document"><time dateTime={item.date}><strong>{date.toLocaleDateString("es-AR", { day: "2-digit", month: "short", year: "numeric" })}</strong><span>{date.toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" })}</span></time><div className="clinical-entry-content"><span className="timeline-kind">Documento adjunto</span><h3>{item.attachment.file_name}</h3><p>{item.attachment.description || attachmentLabel(item.attachment)}</p></div></article>;
  if (item.kind === "study") return <article className="clinical-entry timeline-study"><time dateTime={item.date}><strong>{date.toLocaleDateString("es-AR", { day: "2-digit", month: "short", year: "numeric" })}</strong></time><div className="clinical-entry-content"><span className="timeline-kind">Estudio</span><h3>{item.study.type.replace(/_/g, " ")}</h3>{item.study.indication && <p><b>Indicación:</b> {item.study.indication}</p>}{item.study.conclusion && <p><b>Conclusión:</b> {item.study.conclusion}</p>}</div></article>;
  return <article className="clinical-entry timeline-appointment"><time dateTime={item.date}><strong>{date.toLocaleDateString("es-AR", { day: "2-digit", month: "short", year: "numeric" })}</strong><span>{date.toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" })}</span></time><div className="clinical-entry-content"><span className="timeline-kind">Turno / atención</span><h3>{visibleAppointmentReason(item.appointment.reason) || appointmentTypeLabel(appointmentTypeValue(item.appointment))}</h3><p>{item.appointment.locations?.name || "Centro no informado"}</p></div></article>;
}

function patientAge(birthDate?: string | null) {
  if (!birthDate) return "-";
  const birth = new Date(`${birthDate}T12:00:00`);
  if (Number.isNaN(birth.getTime())) return "-";
  const [year, month, day] = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Argentina/Buenos_Aires", year: "numeric", month: "2-digit", day: "2-digit"
  }).format(new Date()).split("-").map(Number);
  let age = year - birth.getFullYear();
  if (month - 1 < birth.getMonth() || (month - 1 === birth.getMonth() && day < birth.getDate())) age--;
  return age >= 0 ? `${age} años` : "-";
}

function buildClinicalHistoryHtml(patient: Patient, profile: Profile) {
  const evolutions = [...(patient.clinical_evolutions || [])].sort((a, b) => new Date(a.occurred_at).getTime() - new Date(b.occurred_at).getTime());
  const adminNotes = patient.administrative_notes || [];
  const attachments = patient.attachments || [];
  const fileName = buildClinicalHistoryFileName(patient);
  const generatedAt = new Date().toLocaleString();
  const doctorLocation = profile.location?.name || patientConsultorios(patient);

  return `<!doctype html>
<html lang="es">
<head>
  <meta charset="utf-8">
  <title>${escapeHtml(fileName)}</title>
  <style>
    * { box-sizing: border-box; }
    body { font-family: Arial, sans-serif; color: #111; margin: 28px; line-height: 1.35; }
    header { border-bottom: 2px solid #111; padding-bottom: 14px; margin-bottom: 18px; display: flex; justify-content: space-between; gap: 18px; }
    h1 { font-size: 22px; margin: 0 0 6px; }
    h2 { font-size: 16px; margin: 22px 0 8px; border-bottom: 1px solid #bbb; padding-bottom: 4px; }
    h3 { font-size: 14px; margin: 0 0 6px; }
    p { margin: 4px 0; }
    .muted { color: #555; font-size: 12px; }
    .grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 7px 18px; }
    .box { border: 1px solid #ccc; border-radius: 6px; padding: 10px; margin-bottom: 10px; break-inside: avoid; }
    .label { color: #555; font-size: 11px; text-transform: uppercase; letter-spacing: .02em; }
    .value { font-weight: 700; }
    .entry { border-left: 4px solid #176f78; padding-left: 10px; margin-bottom: 14px; break-inside: avoid; }
    ul { margin-top: 6px; padding-left: 18px; }
    footer { margin-top: 30px; border-top: 1px solid #bbb; padding-top: 10px; font-size: 12px; color: #555; }
    @page { margin: 18mm; }
  </style>
</head>
<body>
  <header>
    <div>
      <h1>Historia clinica</h1>
      <p class="muted">Generado: ${escapeHtml(generatedAt)}</p>
      <p class="muted">Nombre sugerido: ${escapeHtml(fileName)}.pdf</p>
    </div>
    <div>
      <p><strong>Profesional:</strong> ${escapeHtml(profile.full_name)}</p>
      <p><strong>Rol:</strong> ${roleLabel(profile)}</p>
      <p><strong>Consultorio:</strong> ${escapeHtml(doctorLocation)}</p>
      <p><strong>Email:</strong> ${escapeHtml(profile.email)}</p>
    </div>
  </header>

  <section>
    <h2>Paciente</h2>
    <div class="grid box">
      ${printField("Apellido y nombre", `${patient.last_name}, ${patient.first_name}`)}
      ${printField("Documento", formatPatientDocument(patient))}
      ${printField("Fecha nacimiento", formatBirthDate(patient.birth_date))}
      ${printField("Telefono", patient.phone || "-")}
      ${printField("Email", patient.email || "-")}
      ${printField("Obra social", patient.insurance_plans?.name || "-")}
      ${printField("Nro. afiliado", patient.affiliate_number || "-")}
      ${printField("Consultorios del paciente", patientConsultorios(patient))}
    </div>
  </section>

  <section>
    <h2>Evoluciones clinicas</h2>
    ${evolutions.length ? evolutions.map(evolution => `
      <article class="entry">
        <h3>${escapeHtml(new Date(evolution.occurred_at).toLocaleDateString())} - ${escapeHtml(evolution.reason)}</h3>
        ${evolution.diagnosis ? `<p><strong>Diagnostico:</strong> ${escapeHtml(evolution.diagnosis)}</p>` : ""}
        ${evolution.notes ? `<p><strong>Evolucion:</strong> ${escapeHtml(evolution.notes)}</p>` : ""}
        ${evolution.indications ? `<p><strong>Indicaciones:</strong> ${escapeHtml(evolution.indications)}</p>` : ""}
        ${evolution.next_visit_at ? `<p><strong>Proximo control orientativo:</strong> ${escapeHtml(new Date(evolution.next_visit_at).toLocaleDateString())}</p>` : ""}
      </article>
    `).join("") : `<p class="muted">Sin evoluciones clinicas registradas.</p>`}
  </section>

  <section>
    <h2>Notas administrativas</h2>
    ${adminNotes.length ? adminNotes.map(note => `
      <article class="box">
        <p class="muted">${escapeHtml(new Date(note.created_at).toLocaleDateString())}</p>
        <p>${escapeHtml(note.text)}</p>
      </article>
    `).join("") : `<p class="muted">Sin notas administrativas.</p>`}
  </section>

  <section>
    <h2>Adjuntos registrados</h2>
    ${attachments.length ? `<ul>${attachments.map(attachment => `<li>${escapeHtml(attachment.file_name)} - ${escapeHtml(attachment.kind)} - ${escapeHtml(attachment.storage_provider === "GOOGLE_DRIVE" ? "Google Drive" : "Archivo subido")}</li>`).join("")}</ul>` : `<p class="muted">Sin adjuntos registrados.</p>`}
  </section>

  <footer>
    <p>Documento generado desde Seguimiento Pacientes. Validar datos profesionales y firma segun requerimiento del consultorio.</p>
  </footer>
</body>
</html>`;
}

function buildClinicalHistoryFileName(patient: Patient) {
  const date = new Date().toISOString().slice(0, 10);
  return sanitizeFileName(`${patient.last_name}_${patient.first_name}_historia_clinica_${date}`);
}

function sanitizeFileName(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9_-]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_|_$/g, "");
}

function printField(label: string, value: string) {
  return `<div><div class="label">${escapeHtml(label)}</div><div class="value">${escapeHtml(value)}</div></div>`;
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function PatientContactForm({ patient, onSaved }: { patient: Patient; onSaved: () => Promise<void> }) {
  const [config, setConfig] = useState<{ insurancePlans: InsurancePlan[] } | null>(null);
  const [form, setForm] = useState<PatientContactInput>({
    phone: patient.phone || "",
    email: patient.email || "",
    affiliate_number: patient.affiliate_number || "",
    insurance_plan_id: patient.insurance_plan_id || "",
    documentation_pending: patient.documentation_pending || false,
    documentation_note: patient.documentation_note || ""
  });
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => { getConfiguration().then(data => setConfig({ insurancePlans: data.insurancePlans })); }, []);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError("");
    setSaved(false);
    setSaving(true);
    try {
      await updatePatientContact(patient.id, form);
      await onSaved();
      setSaved(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudieron guardar los datos.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form className="panel form-card" onSubmit={submit}>
      <h2>Editar datos de contacto</h2>
      <p className="notice">Nombre, tipo y numero de documento, y fecha de nacimiento quedan bloqueados para evitar errores de identidad.</p>
      <div className="form-grid">
        <label>Telefono WhatsApp<input value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} /></label>
        <label>Email<input value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} /></label>
        <label>Obra social
          <select value={form.insurance_plan_id} onChange={e => setForm({ ...form, insurance_plan_id: e.target.value })}>
            <option value="">Sin obra social</option>
            {(config?.insurancePlans || []).filter(plan => plan.active).map(plan => <option key={plan.id} value={plan.id}>{plan.name}</option>)}
          </select>
        </label>
        <label>Nro. afiliado<input value={form.affiliate_number} onChange={e => setForm({ ...form, affiliate_number: e.target.value })} /></label>
        <label className="check-row"><input type="checkbox" checked={form.documentation_pending || false} onChange={e => setForm({ ...form, documentation_pending: e.target.checked })} /> Documentacion pendiente</label>
        {form.documentation_pending && <label>Detalle pendiente<input value={form.documentation_note || ""} onChange={e => setForm({ ...form, documentation_note: e.target.value })} placeholder="Ej.: orden, autorizacion, estudios previos" /></label>}
      </div>
      {saved && <p className="notice ok-notice">Datos actualizados.</p>}
      {error && <p className="error">{error}</p>}
      <div className="form-actions"><button className="primary" disabled={saving}>{saving ? "Guardando..." : "Guardar cambios"}</button></div>
    </form>
  );
}

function ContactActions({ patient,profile }: { patient: Patient;profile:Profile }) {
  const [showCommunication,setShowCommunication]=useState(false);
  const whatsapp = buildWhatsappUrl(patient.phone, `Hola ${patient.first_name}, le escribimos del consultorio.`);
  const mail = patient.email ? `mailto:${patient.email}?subject=${encodeURIComponent("Consultorio cardiologia")}` : "";

  return (
    <div className="contact-strip">
      <strong>Contacto</strong>
      {whatsapp ? <a href={whatsapp} target="_blank" rel="noreferrer">WhatsApp</a> : <span>Sin WhatsApp</span>}
      {mail ? <a href={mail}>Email</a> : <span>Sin email</span>}
      <button type="button" onClick={()=>setShowCommunication(!showCommunication)}>Registrar comunicacion</button>
      {showCommunication&&<CommunicationComposer patient={patient} profile={profile}/>}
    </div>
  );
}

function DocumentShareForm({ patient, profile }: { patient: Patient; profile: Profile }) {
  const attachments = patient.attachments || [];
  const [recipientMode, setRecipientMode] = useState<"patient" | "other">("patient");
  const [recipientEmail, setRecipientEmail] = useState(patient.email || "");
  const [subject, setSubject] = useState(`Documentacion medica - ${patient.last_name}, ${patient.first_name}`);
  const [message, setMessage] = useState("Adjunto/comparto la documentacion solicitada.");
  const [includeHistory, setIncludeHistory] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>(attachments.map(attachment => attachment.id));
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [prepared, setPrepared] = useState(false);

  const destination = recipientMode === "patient" ? patient.email || "" : recipientEmail;
  const selectedAttachments = attachments.filter(attachment => selectedIds.includes(attachment.id));

  function toggleAttachment(id: string) {
    setSelectedIds(current => current.includes(id) ? current.filter(item => item !== id) : [...current, id]);
    setPrepared(false);
  }

  async function openEmail() {
    if (!destination.trim()) {
      setError("Falta el email del destinatario.");
      return;
    }
    setLoading(true);
    setError("");
    setPrepared(false);

    try {
      const lines = [
        message.trim(),
        "",
        `Paciente: ${patient.last_name}, ${patient.first_name}`,
        patient.document ? `Documento: ${formatPatientDocument(patient)}` : "",
        "",
      ].filter(Boolean);

      if (includeHistory) {
        lines.push("Historia clinica: se abre una ventana para imprimir o guardar como PDF y adjuntar al correo.");
      }

      if (selectedAttachments.length) {
        lines.push("", "Informes / estudios:");
        for (const attachment of selectedAttachments) {
          const url = await getAttachmentShareUrl(attachment);
          lines.push(`- ${attachment.file_name} (${attachmentLabel(attachment)}): ${url || "sin enlace disponible"}`);
        }
      }

      lines.push("", `Enviado por: ${profile.full_name}`, profile.location?.name ? `Consultorio: ${profile.location.name}` : "");

      if (includeHistory) printClinicalHistory(patient, profile);
      window.location.href = buildMailto(destination, subject, lines.filter(Boolean).join("\n"));
      setPrepared(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo preparar el envio.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="panel share-panel">
      <div>
        <h2>Enviar historia, informes o estudios</h2>
        <p className="notice">El correo se abre preparado. Por seguridad del navegador, los PDF generados se adjuntan manualmente despues de guardarlos.</p>
      </div>

      <div className="segmented">
        <button type="button" className={recipientMode === "patient" ? "active" : ""} onClick={() => { setRecipientMode("patient"); setRecipientEmail(patient.email || ""); }}>Paciente</button>
        <button type="button" className={recipientMode === "other" ? "active" : ""} onClick={() => setRecipientMode("other")}>Otro medico / institucion</button>
      </div>

      <div className="form-grid">
        <label>Email destino<input value={recipientMode === "patient" ? patient.email || "" : recipientEmail} disabled={recipientMode === "patient"} onChange={event => setRecipientEmail(event.target.value)} placeholder="correo@institucion.com" /></label>
        <label>Asunto<input value={subject} onChange={event => setSubject(event.target.value)} /></label>
        <label className="full-field">Mensaje<textarea value={message} onChange={event => setMessage(event.target.value)} /></label>
      </div>

      {canAccessClinical(profile) && (
        <label className="check-row">
          <input type="checkbox" checked={includeHistory} onChange={event => { setIncludeHistory(event.target.checked); setPrepared(false); }} />
          Incluir historia clinica completa para imprimir/guardar como PDF
        </label>
      )}

      <div className="document-picker">
        <strong>Informes y estudios adjuntos</strong>
        {!attachments.length && <p className="notice">No hay adjuntos cargados para este paciente.</p>}
        {attachments.map(attachment => (
          <label className="document-option" key={attachment.id}>
            <input type="checkbox" checked={selectedIds.includes(attachment.id)} onChange={() => toggleAttachment(attachment.id)} />
            <span>
              <b>{attachment.file_name}</b>
              <small>{attachmentLabel(attachment)} - {attachment.storage_provider === "GOOGLE_DRIVE" ? "Drive" : "link temporal"}</small>
            </span>
          </label>
        ))}
      </div>

      {error && <p className="error">{error}</p>}
      {prepared && <p className="notice ok-notice">Correo preparado. Revisa el destinatario y adjunta el PDF de historia si corresponde.</p>}
      <div className="form-actions">
        {includeHistory && <button type="button" className="secondary-action" onClick={() => printClinicalHistory(patient, profile)}>Imprimir historia</button>}
        <button type="button" className="primary" disabled={loading} onClick={openEmail}>{loading ? "Preparando..." : "Abrir email"}</button>
      </div>
    </section>
  );
}

async function getAttachmentShareUrl(attachment: Attachment) {
  if (attachment.storage_provider === "GOOGLE_DRIVE") return attachment.external_url || "";
  if (attachment.storage_path) return createSignedAttachmentUrl(attachment.storage_path);
  return "";
}

function buildMailto(to: string, subject: string, body: string) {
  return `mailto:${encodeURIComponent(to)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

function attachmentLabel(attachment: Attachment) {
  const kind = attachment.kind.replace(/_/g, " ").toLowerCase();
  return kind;
}

function ClinicalEvolutionForm({ patient, onSaved }: { patient: Patient; onSaved: () => Promise<void> }) {
  const [form, setForm] = useState({
    occurred_at: toBuenosAiresDatetimeLocal(),
    reason: "",
    diagnosis: "",
    notes: "",
    indications: "",
    requested_studies: "",
    next_visit_at: ""
  });
  const [error, setError] = useState("");

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError("");
    try {
      await createClinicalEvolution({ ...form, patient_id: patient.id });
      setForm({ occurred_at: toBuenosAiresDatetimeLocal(), reason: "", diagnosis: "", notes: "", indications: "", requested_studies: "", next_visit_at: "" });
      await onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo guardar la evolucion.");
    }
  }

  return (
    <form className="panel form-card" onSubmit={submit}>
      <h2>Nueva atención clínica</h2>
      <div className="form-grid">
        <label>Fecha y hora<input type="datetime-local" value={form.occurred_at} onChange={e => setForm({ ...form, occurred_at: e.target.value })} /></label>
        <label>Motivo de visita <small>(opcional)</small><input value={form.reason} placeholder="Ej.: Control, consulta, seguimiento" onChange={e => setForm({ ...form, reason: e.target.value })} /></label>
        <label>Diagnostico<textarea value={form.diagnosis} onChange={e => setForm({ ...form, diagnosis: e.target.value })} /></label>
        <label>Indicaciones<textarea value={form.indications} onChange={e => setForm({ ...form, indications: e.target.value })} /></label>
        <label>Estudios solicitados <small>(opcional)</small><textarea value={form.requested_studies} placeholder="Ej.: laboratorio, ecocardiograma, Holter" onChange={e => setForm({ ...form, requested_studies: e.target.value })} /></label>
        <label className="full-field">Evolucion / nota medica<textarea value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} /></label>
        <label>Proximo control orientativo<input type="date" value={form.next_visit_at} onChange={e => setForm({ ...form, next_visit_at: e.target.value })} /></label>
      </div>
      {error && <p className="error">{error}</p>}
      <div className="form-actions"><button className="primary">Guardar evolucion</button></div>
    </form>
  );
}

function AdministrativeNoteForm({ patient, onSaved }: { patient: Patient; onSaved: () => Promise<void> }) {
  const [text, setText] = useState("");
  const [error, setError] = useState("");

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!text.trim()) return setError("Escribi la nota administrativa.");
    setError("");
    const input: AdministrativeNoteInput = { patient_id: patient.id, text };
    try {
      await createAdministrativeNote(input);
      setText("");
      await onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo guardar la nota.");
    }
  }

  return (
    <form className="panel form-card" onSubmit={submit}>
      <h2>Nueva nota administrativa</h2>
      <label>Nota<textarea value={text} onChange={e => setText(e.target.value)} placeholder="Ej: llamo para cambiar telefono, adeuda autorizacion, retiro informe..." /></label>
      {error && <p className="error">{error}</p>}
      <div className="form-actions"><button className="primary">Guardar nota</button></div>
    </form>
  );
}
function AttachmentForm({ patient, onUploaded, embedded = false }: { patient: Patient; onUploaded: () => Promise<void>; embedded?: boolean }) {
  const [mode, setMode] = useState<"drive" | "upload">("drive");
  const [file, setFile] = useState<File | null>(null);
  const [driveUrl, setDriveUrl] = useState("");
  const [driveFileName, setDriveFileName] = useState("");
  const [kind, setKind] = useState<Attachment["kind"]>("ESTUDIO_PREVIO");
  const [description, setDescription] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (mode === "upload" && !file) return setError("Selecciona un archivo.");
    if (mode === "drive" && !driveUrl.trim()) return setError("Pega el enlace de Google Drive.");
    if (mode === "drive" && !driveFileName.trim()) return setError("Escribi el nombre del archivo.");
    setLoading(true);
    setError("");
    try {
      if (mode === "upload" && file) {
        await uploadPatientAttachment({ patientId: patient.id, file, origin: "MEDICA", kind, description });
      } else {
        await linkDriveAttachment({ patientId: patient.id, fileName: driveFileName, driveUrl, origin: "MEDICA", kind, description });
      }
      setFile(null);
      setDriveUrl("");
      setDriveFileName("");
      setDescription("");
      await onUploaded();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo adjuntar.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form className={embedded ? "attach-form embedded-attach-form" : "panel attach-form"} onSubmit={submit}>
      <h2>Elegir cómo guardar el documento</h2>
      <p className="attach-mode-help">Vinculá un archivo que ya está en Google Drive o subí una copia desde este dispositivo.</p>
      <div className="segmented">
        <button type="button" className={mode === "drive" ? "active" : ""} onClick={() => setMode("drive")}>Vincular desde Drive</button>
        <button type="button" className={mode === "upload" ? "active" : ""} onClick={() => setMode("upload")}>Subir archivo</button>
      </div>
      <div className="form-grid">
        {mode === "drive" ? (
          <>
            <label>Nombre del archivo<input value={driveFileName} onChange={e => setDriveFileName(e.target.value)} placeholder="Ej: Holter Perez Juan.pdf" /></label>
            <label>Enlace de Google Drive<input value={driveUrl} onChange={e => setDriveUrl(e.target.value)} placeholder="https://drive.google.com/..." /></label>
          </>
        ) : (
          <label>Archivo<input type="file" accept=".pdf,image/*,video/*" onChange={e => setFile(e.target.files?.[0] || null)} /></label>
        )}
        <label>Tipo
          <select value={kind} onChange={e => setKind(e.target.value as Attachment["kind"])}>
            <option value="ESTUDIO_PREVIO">Estudio previo</option>
            <option value="INFORME_PROPIO">Informe propio</option>
            <option value="ORDEN_MEDICA">Orden medica</option>
            <option value="IMAGEN">Imagen</option>
            <option value="VIDEO">Video</option>
            <option value="OTRO">Otro</option>
          </select>
        </label>
        <label>Descripcion<input value={description} onChange={e => setDescription(e.target.value)} placeholder="Ej: eco previa, laboratorio, Holter externo" /></label>
      </div>
      <p className="notice">{mode === "drive" ? "Se guarda el enlace de Google Drive en la historia. El archivo no se copia a Supabase." : "Se sube una copia segura y queda archivada en la historia."}</p>
      {error && <p className="error">{error}</p>}
      <button className="primary" disabled={loading}>{loading ? "Guardando..." : "Guardar adjunto"}</button>
    </form>
  );
}

function AttachmentList({ attachments }: { attachments: Attachment[] }) {
  if (!attachments.length) return <p className="notice">Sin adjuntos cargados.</p>;
  return (
    <div className="list">
      {attachments.map(attachment => <AttachmentCard key={attachment.id} attachment={attachment} />)}
    </div>
  );
}

function AttachmentCard({ attachment }: { attachment: Attachment }) {
  const [url, setUrl] = useState<string | null>(null);
  return (
    <div className="card">
      <strong>{attachment.file_name}</strong>
      <span>{attachment.kind.replace(/_/g, " ")} - {attachment.storage_provider === "GOOGLE_DRIVE" ? "Google Drive" : "Archivo subido"} - {new Date(attachment.created_at).toLocaleDateString()}</span>
      {attachment.description && <p>{attachment.description}</p>}
      {attachment.storage_provider === "GOOGLE_DRIVE" && attachment.external_url && <a className="link" href={attachment.external_url} target="_blank" rel="noreferrer">Abrir en Drive</a>}
      {attachment.storage_provider === "SUPABASE" && attachment.storage_path && <button onClick={() => createSignedAttachmentUrl(attachment.storage_path!).then(setUrl)}>Abrir por 10 min</button>}
      {url && <a className="link" href={url} target="_blank" rel="noreferrer">Ver archivo</a>}
    </div>
  );
}

function Studies({ onOpenPatient }: { onOpenPatient: (id: string) => void }) {
  const [studies, setStudies] = useState<Study[]>([]);
  const [reports, setReports] = useState<Report[]>([]);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [patients, setPatients] = useState<Patient[]>([]);
  const [tab, setTab] = useState<"realizados" | "documentos" | "pendientes">("realizados");
  const [showAttach, setShowAttach] = useState(false);
  const [patientQuery, setPatientQuery] = useState("");
  const [selectedPatientId, setSelectedPatientId] = useState("");

  async function refresh() {
    const [nextStudies, nextReports, nextAttachments, nextPatients] = await Promise.all([
      listStudies(), listReports(), listAttachments(), listPatients()
    ]);
    setStudies(nextStudies);
    setReports(nextReports);
    setAttachments(nextAttachments);
    setPatients(nextPatients);
  }

  useEffect(() => { void refresh(); }, []);

  const pendingReports = reports.filter(report => report.status !== "ASOCIADO");
  const selectedPatient = patients.find(patient => patient.id === selectedPatientId) || null;
  const matchingPatients = patients.filter(patient => {
    const text = `${patient.last_name} ${patient.first_name} ${patient.document || ""} ${formatPatientDocument(patient)}`.toLocaleLowerCase("es-AR");
    return patient.status !== "baja" && (!patientQuery.trim() || text.includes(patientQuery.trim().toLocaleLowerCase("es-AR")));
  }).slice(0, 8);

  return (
    <Page
      title="Estudios y documentos"
      subtitle="Informes realizados y archivos guardados en la historia de cada paciente"
      actions={<button className="primary" onClick={() => setShowAttach(true)}>+ Adjuntar documento</button>}
    >
      <div className="segmented study-tabs">
        <button type="button" className={tab === "realizados" ? "active" : ""} onClick={() => setTab("realizados")}>Estudios e informes</button>
        <button type="button" className={tab === "documentos" ? "active" : ""} onClick={() => setTab("documentos")}>Documentos de pacientes</button>
        <button type="button" className={tab === "pendientes" ? "active" : ""} onClick={() => setTab("pendientes")}>Pendientes</button>
      </div>

      {tab === "realizados" && (
        <Table headers={["Fecha", "Paciente", "Tipo", "Estado"]}>
          {studies.map(s => (
            <tr key={s.id}>
              <td>{s.performed_at ? new Date(s.performed_at).toLocaleDateString() : "-"}</td>
              <td><button className="link" onClick={() => onOpenPatient(s.patient_id)}>{s.patients?.last_name}, {s.patients?.first_name}</button></td>
              <td>{s.type}</td>
              <td>{s.status}</td>
            </tr>
          ))}
        </Table>
      )}

      {tab === "documentos" && (
        attachments.length ? <Table headers={["Fecha", "Paciente", "Archivo", "Tipo", "Guardado en"]}>
          {attachments.map(attachment => (
            <tr key={attachment.id}>
              <td>{new Date(attachment.created_at).toLocaleDateString()}</td>
              <td><button className="link" onClick={() => onOpenPatient(attachment.patient_id)}>{attachment.patients?.last_name}, {attachment.patients?.first_name}</button></td>
              <td>{attachment.file_name}</td>
              <td>{attachment.kind.replace(/_/g, " ")}</td>
              <td>{attachment.storage_provider === "GOOGLE_DRIVE" ? "Google Drive" : "Copia segura en la nube"}</td>
            </tr>
          ))}
        </Table> : <div className="document-empty-state">
          <strong>Todavia no hay documentos guardados</strong>
          <p>Usa “Adjuntar documento”, elegi el paciente y decidi si queres vincularlo desde Google Drive o subir una copia.</p>
          <button className="primary" onClick={() => setShowAttach(true)}>Adjuntar el primero</button>
        </div>
      )}

      {tab === "pendientes" && (
        <div className="list">
          {pendingReports.map(report => <div className="card" key={report.id}><strong>{report.file_name}</strong><span>{report.source} - {report.status}</span></div>)}
          {pendingReports.length === 0 && <p className="notice">No hay archivos pendientes de asociar.</p>}
        </div>
      )}

      {showAttach && <Modal onClose={() => { setShowAttach(false); setSelectedPatientId(""); setPatientQuery(""); }}>
        <div className="document-modal-head">
          <div><h2>Guardar documento</h2><p>El archivo quedara dentro de la historia del paciente elegido.</p></div>
          <button type="button" className="secondary-action" onClick={() => setShowAttach(false)}>Cerrar</button>
        </div>

        {!selectedPatient && <div className="document-patient-picker">
          <label>Buscar paciente<input value={patientQuery} onChange={event => setPatientQuery(event.target.value)} placeholder="Nombre o numero de documento" autoFocus /></label>
          <div className="document-patient-results">
            {matchingPatients.map(patient => (
              <button type="button" key={patient.id} onClick={() => setSelectedPatientId(patient.id)}>
                <strong>{patient.last_name}, {patient.first_name}</strong>
                <span>{formatPatientDocument(patient)}</span>
              </button>
            ))}
            {patientQuery.trim() && matchingPatients.length === 0 && <p className="empty-day">No se encontro un paciente visible con esa busqueda.</p>}
          </div>
        </div>}

        {selectedPatient && <>
          <div className="selected-document-patient">
            <span>Paciente</span>
            <strong>{selectedPatient.last_name}, {selectedPatient.first_name}</strong>
            <small>{formatPatientDocument(selectedPatient)}</small>
            <button type="button" className="link" onClick={() => setSelectedPatientId("")}>Cambiar paciente</button>
          </div>
          <AttachmentForm patient={selectedPatient} embedded onUploaded={async () => {
            await refresh();
            setTab("documentos");
            setShowAttach(false);
            setSelectedPatientId("");
            setPatientQuery("");
          }} />
        </>}
      </Modal>}
    </Page>
  );
}

function Tasks() {
  return <Page title="Tareas" subtitle="Pendientes de informe, envio y adjuntos"><p>Vista operativa para pendientes.</p></Page>;
}

function Settings({ profile }: { profile: Profile }) {
  const [data, setData] = useState<{ insurancePlans: InsurancePlan[]; locations: Location[]; availability: MedicalAvailability[]; holidays: Holiday[] } | null>(null);
  const [professionals, setProfessionals] = useState<Profile[]>([]);
  type SettingsModule = "organizacion" | "catalogo" | "consultorios" | "agenda" | "coberturas" | "comunicaciones" | "documentos" | "auditoria";
  const isOrganizationAdmin = profile.is_master || profile.role === "ADMINISTRADOR";
  const hasOwnProfessionalProfile = isDoctorRole(profile.role) && !profile.simulated;
  const modules: Array<{ id: SettingsModule; label: string; hint: string; icon: React.ElementType }> = [
    ...(isOrganizationAdmin ? [
      { id: "organizacion" as const, label: "Organizacion", hint: "Marca, contacto y sedes", icon: Building2 },
      { id: "catalogo" as const, label: "Catalogo", hint: "Especialidades y practicas", icon: Stethoscope },
      { id: "consultorios" as const, label: "Consultorios", hint: "Lugares de atencion", icon: MapPin },
      { id: "comunicaciones" as const, label: "Comunicaciones", hint: "Plantillas de mensajes", icon: Megaphone },
      { id: "auditoria" as const, label: "Auditoria", hint: "Ingresos y actividad", icon: ShieldCheck }
    ] : []),
    { id: "agenda", label: "Agenda", hint: "Horarios y dias no laborables", icon: CalendarDays },
    { id: "coberturas", label: "Obras sociales", hint: "Coberturas disponibles", icon: ClipboardList },
    ...(hasOwnProfessionalProfile ? [{ id: "documentos" as const, label: "Mi perfil profesional", hint: "Matricula, firma y documentos", icon: FileSignature }] : [])
  ];
  const [module, setModule] = useState<SettingsModule>(isOrganizationAdmin ? "organizacion" : "agenda");

  async function refresh() {
    const [config, profileItems] = await Promise.all([
      getConfiguration(),
      isOrganizationAdmin ? listProfiles().catch(() => []) : Promise.resolve([profile])
    ]);
    setData({ insurancePlans: config.insurancePlans, locations: config.locations, availability: config.availability, holidays: config.holidays });
    setProfessionals(profileItems.filter(item => item.active && ["MEDICO", "MEDICA_ADMIN"].includes(item.role)));
  }

  useEffect(() => { refresh(); }, []);
  return (
    <Page title="Ajustes" subtitle="Configuracion organizada por modulos">
      {!canManageConfiguration(profile) && <p className="notice">Tu acceso permite consultar la configuracion, pero no modificarla.</p>}
      {data && (
        <div className="settings-workspace">
          <nav className="settings-modules" aria-label="Modulos de ajustes">
            {modules.map(item => { const Icon = item.icon; return <button key={item.id} type="button" className={module === item.id ? "active" : ""} onClick={() => setModule(item.id)}><Icon size={19} aria-hidden="true" /><span><strong>{item.label}</strong><small>{item.hint}</small></span></button>; })}
          </nav>
          <div className="settings-module-content">
            {module === "organizacion" && isOrganizationAdmin && <OrganizationSettingsManager />}
            {module === "catalogo" && isOrganizationAdmin && <CommercialCatalogManager />}
            {module === "consultorios" && <LocationManager locations={data.locations} canEdit={isOrganizationAdmin} onSaved={refresh} />}
            {module === "comunicaciones" && isOrganizationAdmin && <CommunicationTemplateManager />}
            {module === "coberturas" && <InsuranceManager plans={data.insurancePlans} canEdit={canManageConfiguration(profile)} onSaved={refresh} />}
            {module === "agenda" && <div className="settings-stack"><AvailabilityManager locations={data.locations} availability={data.availability} professionals={professionals} currentProfile={profile} canEdit={canManageConfiguration(profile)} onSaved={refresh} /><HolidayManager holidays={data.holidays} canEdit={canManageConfiguration(profile)} onSaved={refresh} /></div>}
            {module === "documentos" && hasOwnProfessionalProfile && <ProfessionalDocumentSettings profile={profile} />}
            {module === "auditoria" && isOrganizationAdmin && <AuditLogManager />}
          </div>
        </div>
      )}
    </Page>
  );
}

function Users({ profile }: { profile: Profile }) {
  const [users, setUsers] = useState<Profile[]>([]);
  const [config, setConfig] = useState<{ locations: Location[]; organizations: OrganizationSummary[] } | null>(null);

  async function refresh() {
    setUsers(await listProfiles());
    const [data, organizations] = await Promise.all([getConfiguration(), listOrganizations()]);
    setConfig({ locations: data.locations, organizations });
  }

  useEffect(() => { refresh(); }, []);

  return (
    <Page title="Usuarios" subtitle="Accesos de la organizacion">
      {config && <UserManager users={users} locations={config.locations} organizations={config.organizations} currentOrganizationId={profile.organization_id} canManageAdministrators={profile.is_master} onSaved={refresh} />}
    </Page>
  );
}

function AuditLogManager() {
  const today = toDateInputValue(new Date());
  const [filters, setFilters] = useState({ action: "", entity: "", from: "", to: today });
  const [items, setItems] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  async function refresh(next = filters) {
    setLoading(true);
    setError("");
    try { setItems(await listAuditLogs(next)); }
    catch (err) { setError(err instanceof Error ? err.message : "No se pudo consultar la auditoria."); }
    finally { setLoading(false); }
  }

  useEffect(() => { void refresh(); }, []);
  return <section className="panel admin-section wide audit-panel">
    <div className="section-title"><div><h2>Auditoria</h2><p>Ingresos y operaciones relevantes de la organizacion. No muestra contraseñas ni contenido clinico.</p></div></div>
    <form className="audit-filters" onSubmit={event => { event.preventDefault(); void refresh(); }}>
      <label>Accion<input value={filters.action} onChange={event => setFilters({ ...filters, action: event.target.value })} placeholder="LOGIN, USER, PATIENT..." /></label>
      <label>Entidad<select value={filters.entity} onChange={event => setFilters({ ...filters, entity: event.target.value })}><option value="">Todas</option><option value="profiles">Usuarios</option><option value="patients">Pacientes</option><option value="appointments">Turnos</option><option value="clinical_evolutions">Evoluciones</option><option value="attachments">Adjuntos</option></select></label>
      <label>Desde<input type="date" value={filters.from} onChange={event => setFilters({ ...filters, from: event.target.value })} /></label>
      <label>Hasta<input type="date" value={filters.to} onChange={event => setFilters({ ...filters, to: event.target.value })} /></label>
      <button className="primary">Aplicar filtros</button>
    </form>
    {error && <p className="error">{error}</p>}
    {loading ? <p className="empty-day">Cargando actividad...</p> : <div className="audit-list">
      {items.map(item => <article key={item.id}><time>{new Date(item.created_at).toLocaleString("es-AR", { timeZone: "America/Argentina/Buenos_Aires" })}</time><strong>{auditActionLabel(item.action)}</strong><span>{item.actor?.full_name || "Sistema / acceso publico"}{item.actor?.role ? ` · ${item.actor.role.replace(/_/g, " ")}` : ""}</span><small>{item.entity}{item.entity_id ? ` · ${item.entity_id.slice(0, 8)}` : ""}</small></article>)}
      {!items.length && <p className="empty-day">No hay actividad para los filtros elegidos.</p>}
    </div>}
  </section>;
}

function auditActionLabel(action: string) {
  return action.replace(/_/g, " ").toLocaleLowerCase("es").replace(/^./, value => value.toUpperCase());
}

function ProfessionalDocumentSettings({ profile }: { profile: Profile }) {
  const [form, setForm] = useState({
    specialty: profile.specialty || profile.public_booking_specialty || "",
    professional_license: profile.professional_license || "",
    signature_name: profile.signature_name || profile.full_name,
    institution_name: profile.institution_name || "",
    institutional_footer: profile.institutional_footer || ""
  });
  const [status, setStatus] = useState("");
  const [saving, setSaving] = useState(false);
  const [signaturePath, setSignaturePath] = useState(profile.signature_path || "");
  const [signatureUrl, setSignatureUrl] = useState("");
  useEffect(() => { if (signaturePath) createSignedSignatureUrl(signaturePath).then(setSignatureUrl).catch(() => setSignatureUrl("")); else setSignatureUrl(""); }, [signaturePath]);
  async function submit(event: React.FormEvent) {
    event.preventDefault(); setSaving(true); setStatus("");
    try { const updated = await updateMyDocumentProfile(form); Object.assign(profile, updated); setStatus("Datos guardados para los proximos documentos."); }
    catch (error) { setStatus(error instanceof Error ? error.message : "No se pudieron guardar los datos."); }
    finally { setSaving(false); }
  }
  async function uploadSignature(file?: File) {
    if (!file) return;
    setSaving(true); setStatus("");
    try { const path = await uploadMySignature(file, signaturePath); setSignaturePath(path); profile.signature_path = path; setStatus("Firma guardada de forma privada."); }
    catch (error) { setStatus(error instanceof Error ? error.message : "No se pudo guardar la firma."); }
    finally { setSaving(false); }
  }
  async function removeSignature() {
    if (!signaturePath || !window.confirm("Quitar la firma escaneada del perfil?")) return;
    setSaving(true); setStatus("");
    try { await removeMySignature(signaturePath); setSignaturePath(""); profile.signature_path = null; setStatus("Firma eliminada."); }
    catch (error) { setStatus(error instanceof Error ? error.message : "No se pudo eliminar la firma."); }
    finally { setSaving(false); }
  }
  return <section className="panel admin-section professional-document-settings">
    <h2>Datos para documentos PDF</h2>
    <form className="form-grid" onSubmit={submit}>
      <label>Institucion<input value={form.institution_name} onChange={event => setForm({ ...form, institution_name: event.target.value })} placeholder="Nombre del centro o consultorio" /></label>
      <label>Especialidad<input value={form.specialty} onChange={event => setForm({ ...form, specialty: event.target.value })} placeholder="Especialidad profesional" /></label>
      <label>Matricula<input value={form.professional_license} onChange={event => setForm({ ...form, professional_license: event.target.value })} placeholder="MP / MN" /></label>
      <label>Nombre de firma<input value={form.signature_name} onChange={event => setForm({ ...form, signature_name: event.target.value })} /></label>
      <label className="full-field">Pie institucional<input value={form.institutional_footer} onChange={event => setForm({ ...form, institutional_footer: event.target.value })} placeholder="Direccion, telefono o texto institucional" /></label>
      <div className="full-field signature-upload-control"><div><strong>Firma escaneada</strong><small>JPG, JPEG, PNG o WEBP. Maximo 2 MB.</small></div>{signatureUrl && <img src={signatureUrl} alt="Firma escaneada actual" />}<label className="secondary-action">{signaturePath ? "Cambiar firma" : "Cargar firma"}<input type="file" accept="image/jpeg,image/png,image/webp" onChange={event => void uploadSignature(event.target.files?.[0])} /></label>{signaturePath && <button type="button" className="danger-action" onClick={() => void removeSignature()}>Quitar firma</button>}</div>
      {status && <p className={status.startsWith("Datos") ? "notice ok-notice" : "error"}>{status}</p>}
      <div className="form-actions"><button className="primary" disabled={saving}>{saving ? "Guardando..." : "Guardar datos PDF"}</button></div>
    </form>
  </section>;
}

function LocationManager({ locations, canEdit, onSaved }: { locations: Location[]; canEdit: boolean; onSaved: () => Promise<void> }) {
  const [name, setName] = useState("");
  const [address, setAddress] = useState("");
  const [error, setError] = useState("");

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!name.trim()) return setError("Nombre de consultorio obligatorio.");
    setError("");
    await createLocation({ name, address, active: true });
    setName("");
    setAddress("");
    await onSaved();
  }

  return (
    <section className="panel admin-section">
      <h2>Consultorios</h2>
      {!canEdit && <p className="notice">Solo el usuario maestro puede crear, editar o eliminar consultorios.</p>}
      {canEdit && (
        <form className="mini-form" onSubmit={submit}>
          <input placeholder="Nombre del consultorio" value={name} onChange={e => setName(e.target.value)} />
          <input placeholder="Direccion" value={address} onChange={e => setAddress(e.target.value)} />
          {error && <p className="error">{error}</p>}
          <button className="primary">Agregar consultorio</button>
        </form>
      )}
      <div className="list compact-list">
        {locations.map(location => <LocationRow key={location.id} location={location} canEdit={canEdit} onSaved={onSaved} />)}
      </div>
    </section>
  );
}

function LocationRow({ location, canEdit, onSaved }: { location: Location; canEdit: boolean; onSaved: () => Promise<void> }) {
  const [name, setName] = useState(location.name);
  const [address, setAddress] = useState(location.address || "");
  const [error, setError] = useState("");

  async function remove() {
    if (!window.confirm(`Eliminar definitivamente el consultorio "${location.name}"?`)) return;
    setError("");
    try {
      await deleteLocation(location.id);
      await onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo eliminar el consultorio.");
    }
  }

  return (
    <div className="editable-row">
      <input value={name} onChange={e => setName(e.target.value)} disabled={!canEdit} />
      <input value={address} onChange={e => setAddress(e.target.value)} disabled={!canEdit} placeholder="Direccion" />
      <span className={location.active ? "badge ok" : "badge muted"}>{location.active ? "Activa" : "Baja"}</span>
      {canEdit && (
        <div className="row-actions">
          <button onClick={async () => { await updateLocation(location.id, { name, address, active: location.active }); await onSaved(); }}>Guardar</button>
          <button onClick={async () => { await updateLocation(location.id, { name, address, active: !location.active }); await onSaved(); }}>{location.active ? "Dar de baja" : "Reactivar"}</button>
          <button className="danger-action" onClick={() => void remove()}>Eliminar</button>
        </div>
      )}
      {error && <small className="error location-row-error">{error}</small>}
    </div>
  );
}

function InsuranceManager({ plans, canEdit, onSaved }: { plans: InsurancePlan[]; canEdit: boolean; onSaved: () => Promise<void> }) {
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const [expanded, setExpanded] = useState(true);
  const [query, setQuery] = useState("");
  const [visibleCount, setVisibleCount] = useState(20);
  const [editingId, setEditingId] = useState<string | null>(null);

  const filteredPlans = [...plans]
    .filter(plan => !query.trim() || plan.name.toLocaleLowerCase("es-AR").includes(query.trim().toLocaleLowerCase("es-AR")))
    .sort((a, b) => Number(b.active) - Number(a.active) || a.name.localeCompare(b.name, "es"));
  const visiblePlans = filteredPlans.slice(0, visibleCount);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!name.trim()) return setError("Nombre de obra social obligatorio.");
    setError("");
    await createInsurancePlan({ name, active: true });
    setName("");
    await onSaved();
  }

  return (
    <section className="panel admin-section insurance-section">
      <button
        type="button"
        className="section-collapse-toggle"
        onClick={() => setExpanded(current => !current)}
        aria-expanded={expanded}
      >
        <span><strong>Obras sociales</strong><small>{plans.filter(plan => plan.active).length} activas · {plans.length} totales</small></span>
        <b aria-hidden="true">{expanded ? "−" : "+"}</b>
      </button>

      {expanded && <div className="insurance-content">
        <div className="insurance-tools">
          <input
            type="search"
            placeholder="Buscar obra social"
            value={query}
            onChange={event => { setQuery(event.target.value); setVisibleCount(20); }}
          />
          {canEdit && (
            <form className="insurance-add-form" onSubmit={submit}>
              <input placeholder="Nueva obra social" value={name} onChange={e => setName(e.target.value)} />
              <button className="primary">Agregar</button>
            </form>
          )}
        </div>
        {error && <p className="error">{error}</p>}

        <div className="insurance-list">
          {visiblePlans.map(plan => (
            <InsuranceRow
              key={plan.id}
              plan={plan}
              canEdit={canEdit}
              editing={editingId === plan.id}
              onEdit={() => setEditingId(plan.id)}
              onClose={() => setEditingId(null)}
              onSaved={onSaved}
            />
          ))}
          {visiblePlans.length === 0 && <p className="empty-day">No se encontraron obras sociales.</p>}
        </div>

        {visibleCount < filteredPlans.length && (
          <button type="button" className="secondary-action insurance-more" onClick={() => setVisibleCount(count => count + 20)}>
            Ver 20 más
          </button>
        )}
      </div>}
    </section>
  );
}

function InsuranceRow({ plan, canEdit, editing, onEdit, onClose, onSaved }: {
  plan: InsurancePlan;
  canEdit: boolean;
  editing: boolean;
  onEdit: () => void;
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const [name, setName] = useState(plan.name);
  useEffect(() => { setName(plan.name); }, [plan.name]);

  if (!editing) {
    return (
      <div className="insurance-compact-row">
        <strong>{plan.name}</strong>
        <span className={plan.active ? "badge ok" : "badge muted"}>{plan.active ? "Activa" : "Baja"}</span>
        {canEdit && <button type="button" className="icon-button insurance-edit" title="Editar obra social" aria-label={`Editar ${plan.name}`} onClick={onEdit}><Pencil size={16} /></button>}
      </div>
    );
  }

  return (
    <div className="insurance-compact-row editing">
      <input value={name} onChange={e => setName(e.target.value)} autoFocus />
      <span className={plan.active ? "badge ok" : "badge muted"}>{plan.active ? "Activa" : "Baja"}</span>
      <div className="row-actions">
        <button onClick={async () => { await updateInsurancePlan(plan.id, { name, active: plan.active }); await onSaved(); onClose(); }}>Guardar</button>
        <button type="button" onClick={onClose}>Cancelar</button>
        <button onClick={async () => { await updateInsurancePlan(plan.id, { name, active: !plan.active }); await onSaved(); onClose(); }}>{plan.active ? "Dar de baja" : "Reactivar"}</button>
      </div>
    </div>
  );
}

function AvailabilityManager({ locations, availability, professionals, currentProfile, canEdit, onSaved }: { locations: Location[]; availability: MedicalAvailability[]; professionals: Profile[]; currentProfile: Profile; canEdit: boolean; onSaved: () => Promise<void> }) {
  const activeLocations = locations.filter(location => location.active);
  const selectableProfessionals = professionals.length ? professionals : [currentProfile].filter(item => ["MEDICO", "MEDICA_ADMIN"].includes(item.role));
  const [selectedDoctorId, setSelectedDoctorId] = useState(selectableProfessionals.find(item => item.id === currentProfile.id)?.id || selectableProfessionals[0]?.id || "");
  const [form, setForm] = useState<MedicalAvailabilityInput>({
    location_id: activeLocations[0]?.id || "",
    doctor_id: selectableProfessionals.find(item => item.id === currentProfile.id)?.id || selectableProfessionals[0]?.id || "",
    weekday: 1,
    start_time: "09:00",
    end_time: "13:00",
    slot_interval_min: 15,
    enabled: true
  });
  const [error, setError] = useState("");
  useEffect(() => {
    if (selectedDoctorId || !selectableProfessionals[0]) return;
    setSelectedDoctorId(selectableProfessionals[0].id);
    setForm(current => ({ ...current, doctor_id: selectableProfessionals[0].id }));
  }, [selectedDoctorId, selectableProfessionals]);
  const selectedAvailability = availability
    .filter(item => !selectedDoctorId || item.doctor_id === selectedDoctorId)
    .sort((a, b) => a.weekday - b.weekday || a.start_time.localeCompare(b.start_time));
  const weekDays = [1, 2, 3, 4, 5, 6, 0];

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!form.location_id) return setError("Elegir consultorio.");
    if (!form.doctor_id) return setError("Elegir profesional.");
    if (timeToMinutes(form.start_time) >= timeToMinutes(form.end_time)) return setError("El horario desde debe ser menor al horario hasta.");
    setError("");
    await createAvailability(form);
    await onSaved();
  }

  return (
    <section className="panel admin-section wide">
      <div className="availability-heading">
        <div><h2>Agenda por profesional</h2><p>Definí dónde y cuándo atiende cada profesional. El consultorio se asigna automáticamente al dar el turno.</p></div>
        <label>Profesional
          <select value={selectedDoctorId} onChange={event => { const doctorId = event.target.value; setSelectedDoctorId(doctorId); setForm(current => ({ ...current, doctor_id: doctorId })); }}>
            {selectableProfessionals.map(item => <option key={item.id} value={item.id}>{professionalOptionLabel(item)}</option>)}
          </select>
        </label>
      </div>
      {canEdit && (
        <form className="availability-form" onSubmit={submit}>
          <label>Consultorio
            <select value={form.location_id} onChange={e => setForm({ ...form, location_id: e.target.value })}>
              <option value="">Elegir consultorio</option>
              {activeLocations.map(location => <option key={location.id} value={location.id}>{location.name}</option>)}
            </select>
          </label>
          <label>Dia
            <select value={form.weekday} onChange={e => setForm({ ...form, weekday: Number(e.target.value) })}>
              {[1,2,3,4,5,6,0].map(day => <option key={day} value={day}>{weekdayName(day)}</option>)}
            </select>
          </label>
          <label>Desde<input type="time" step="900" value={form.start_time} onChange={e => setForm({ ...form, start_time: e.target.value })} /></label>
          <label>Hasta<input type="time" step="900" value={form.end_time} onChange={e => setForm({ ...form, end_time: e.target.value })} /></label>
          <label>Turnos cada
            <select value={form.slot_interval_min} onChange={e => setForm({ ...form, slot_interval_min: Number(e.target.value) })}>
              {durationOptions().map(value => <option key={value} value={value}>{value} min</option>)}
            </select>
          </label>
          <button className="primary">Agregar horario</button>
          {error && <p className="error">{error}</p>}
        </form>
      )}
      <div className="availability-week-grid">
        {weekDays.map(day => { const dayItems = selectedAvailability.filter(item => item.weekday === day); return <section key={day} className={dayItems.length ? "availability-day-column has-slots" : "availability-day-column"}>
          <header><strong>{weekdayName(day)}</strong><small>{dayItems.length ? `${dayItems.length} ${dayItems.length === 1 ? "bloque" : "bloques"}` : "Sin atención"}</small></header>
          <div>{dayItems.map(item => <AvailabilityRow key={item.id} item={item} locations={activeLocations} professionals={selectableProfessionals} canEdit={canEdit} onSaved={onSaved} />)}</div>
        </section>; })}
      </div>
    </section>
  );
}

function AvailabilityRow({ item, locations, professionals, canEdit, onSaved }: { item: MedicalAvailability; locations: Location[]; professionals: Profile[]; canEdit: boolean; onSaved: () => Promise<void> }) {
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<MedicalAvailabilityInput>({
    location_id: item.location_id,
    doctor_id: item.doctor_id,
    weekday: item.weekday,
    start_time: item.start_time,
    end_time: item.end_time,
    slot_interval_min: item.slot_interval_min || 15,
    enabled: item.enabled
  });

  if (!editing) return <article className={form.enabled ? "availability-slot-card" : "availability-slot-card inactive"}>
    <div><strong>{form.start_time.slice(0, 5)}–{form.end_time.slice(0, 5)}</strong><small>{locations.find(location => location.id === form.location_id)?.name || "Consultorio no disponible"}</small><span>Cada {form.slot_interval_min} min</span></div>
    {canEdit && <button type="button" className="icon-button" title="Editar horario" aria-label="Editar horario" onClick={() => setEditing(true)}><Pencil size={16} /></button>}
  </article>;

  return (
    <div className="editable-row availability-row editing">
      <select value={form.doctor_id || ""} onChange={e => setForm({ ...form, doctor_id: e.target.value })} disabled={!canEdit}>
        {professionals.map(professional => <option key={professional.id} value={professional.id}>{professionalOptionLabel(professional)}</option>)}
      </select>
      <select value={form.location_id} onChange={e => setForm({ ...form, location_id: e.target.value })} disabled={!canEdit}>
        {locations.map(location => <option key={location.id} value={location.id}>{location.name}</option>)}
      </select>
      <select value={form.weekday} onChange={e => setForm({ ...form, weekday: Number(e.target.value) })} disabled={!canEdit}>
        {[1,2,3,4,5,6,0].map(day => <option key={day} value={day}>{weekdayName(day)}</option>)}
      </select>
      <input type="time" step="900" value={form.start_time} onChange={e => setForm({ ...form, start_time: e.target.value })} disabled={!canEdit} />
      <input type="time" step="900" value={form.end_time} onChange={e => setForm({ ...form, end_time: e.target.value })} disabled={!canEdit} />
      <select value={form.slot_interval_min} onChange={e => setForm({ ...form, slot_interval_min: Number(e.target.value) })} disabled={!canEdit}>
        {durationOptions().map(value => <option key={value} value={value}>{value} min</option>)}
      </select>
      <span className={form.enabled ? "badge ok" : "badge muted"}>{form.enabled ? "Activo" : "Inactivo"}</span>
      {canEdit && (
        <div className="row-actions">
          <button onClick={async () => { await updateAvailability(item.id, form); await onSaved(); setEditing(false); }}>Guardar</button>
          <button type="button" onClick={() => setEditing(false)}>Cancelar</button>
          <button onClick={async () => { await updateAvailability(item.id, { ...form, enabled: !form.enabled }); await onSaved(); setEditing(false); }}>{form.enabled ? "Desactivar" : "Activar"}</button>
        </div>
      )}
    </div>
  );
}

function professionalOptionLabel(profile: Pick<Profile, "full_name" | "specialty" | "professional_license">) {
  const details = [profile.specialty, profile.professional_license ? `M.P. ${profile.professional_license.replace(/^M\.?P\.?\s*/i, "")}` : ""].filter(Boolean);
  return `${profile.full_name}${details.length ? ` · ${details.join(" · ")}` : ""}`;
}

function HolidayManager({ holidays, canEdit, onSaved }: { holidays: Holiday[]; canEdit: boolean; onSaved: () => Promise<void> }) {
  const [date, setDate] = useState(toDateInputValue(new Date()));
  const [name, setName] = useState("");
  const [kind, setKind] = useState<Holiday["kind"]>("FERIADO");
  const [error, setError] = useState("");

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!date) return setError("Elegir fecha.");
    setError("");
    try {
      await createHoliday({ date, name: name.trim() || "Feriado", kind, active: true });
      setName("");
      setKind("FERIADO");
      await onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo agregar el dia no laborable.");
    }
  }

  return (
    <section className="panel admin-section">
      <h2>Dias no laborables</h2>
      <p className="notice">Feriados, vacaciones, congresos o licencias bloquean la turnera aunque el medico tenga disponibilidad ese dia.</p>
      {canEdit && (
        <form className="mini-form" onSubmit={submit}>
          <input type="date" value={date} onChange={e => setDate(e.target.value)} />
          <select value={kind} onChange={e => setKind(e.target.value as Holiday["kind"])}>
            <option value="FERIADO">Feriado</option>
            <option value="VACACIONES">Vacaciones</option>
            <option value="CONGRESO">Congreso</option>
            <option value="LICENCIA">Licencia</option>
            <option value="OTRO">Otro</option>
          </select>
          <input placeholder="Etiqueta opcional (por defecto: Feriado)" value={name} onChange={e => setName(e.target.value)} />
          {error && <p className="error">{error}</p>}
          <button className="primary">Agregar bloqueo</button>
        </form>
      )}
      <div className="list compact-list">
        {holidays.map(holiday => <HolidayRow key={holiday.id} holiday={holiday} canEdit={canEdit} onSaved={onSaved} />)}
        {holidays.length === 0 && <p className="empty-day">Sin dias no laborables cargados.</p>}
      </div>
    </section>
  );
}

function HolidayRow({ holiday, canEdit, onSaved }: { holiday: Holiday; canEdit: boolean; onSaved: () => Promise<void> }) {
  const [date, setDate] = useState(holiday.date);
  const [name, setName] = useState(holiday.name);
  const [kind, setKind] = useState<Holiday["kind"]>(holiday.kind || "FERIADO");

  return (
    <div className="editable-row">
      <input type="date" value={date} onChange={e => setDate(e.target.value)} disabled={!canEdit} />
      <select value={kind} onChange={e => setKind(e.target.value as Holiday["kind"])} disabled={!canEdit}>
        <option value="FERIADO">Feriado</option>
        <option value="VACACIONES">Vacaciones</option>
        <option value="CONGRESO">Congreso</option>
        <option value="LICENCIA">Licencia</option>
        <option value="OTRO">Otro</option>
      </select>
      <input value={name} onChange={e => setName(e.target.value)} disabled={!canEdit} />
      <span className={holiday.active ? "badge ok" : "badge muted"}>{holiday.active ? "Activo" : "Baja"}</span>
      {canEdit && (
        <div className="row-actions">
          <button onClick={async () => { await updateHoliday(holiday.id, { date, name, kind, active: holiday.active }); await onSaved(); }}>Guardar</button>
          <button onClick={async () => { await updateHoliday(holiday.id, { date, name, kind, active: !holiday.active }); await onSaved(); }}>{holiday.active ? "Dar de baja" : "Reactivar"}</button>
        </div>
      )}
    </div>
  );
}

const rootElement = document.getElementById("root")!;
const rootWindow = window as typeof window & { __seguimientoPacientesRoot?: ReturnType<typeof createRoot> };
const root = rootWindow.__seguimientoPacientesRoot || createRoot(rootElement);
rootWindow.__seguimientoPacientesRoot = root;

root.render(
  <AppErrorBoundary>
    <App />
  </AppErrorBoundary>
);




