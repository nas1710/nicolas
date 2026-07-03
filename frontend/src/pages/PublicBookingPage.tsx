import React, { useEffect, useMemo, useState } from "react";
import {
  formatDocumentNumber,
  formatProperName,
  getOrganizationSettings,
  getPublicCommercialCatalog,
  IdentityDocumentType,
  InsurancePlan,
  listPublicBookingInsurancePlans,
  normalizeDocumentNumber,
  OrganizationSettings,
  organizationLogoUrl,
  PublicBookingDate,
  PublicBookingResult,
  PublicBookingSearchSlot,
  PublicCommercialCatalog,
  requestCatalogBooking,
  searchPublicBookingSlots
} from "../api/supabase";
import { useBuenosAiresClock } from "../hooks/useBuenosAiresClock";
import { toDateInputValue } from "../utils/dates";
import { documentTypeOptions } from "../utils/identity";

export function PublicBookingPage() {
  const params = new URLSearchParams(window.location.search);
  const organizationSlug = params.get("org") || "";
  const officialClock = useBuenosAiresClock();
  const today = officialClock.today;
  const maxDate = addDays(today, 60);
  const [catalog, setCatalog] = useState<PublicCommercialCatalog>({ specialties: [], practices: [], professionals: [], locations: [] });
  const [organization, setOrganization] = useState<OrganizationSettings | null>(null);
  const [insurancePlans, setInsurancePlans] = useState<Pick<InsurancePlan, "id" | "name">[]>([]);
  const [specialtyId, setSpecialtyId] = useState(params.get("especialidad") || "");
  const [practiceIds, setPracticeIds] = useState<string[]>([]);
  const [doctorId, setDoctorId] = useState(params.get("profesional") || params.get("doctor") || "");
  const [locationId, setLocationId] = useState("");
  const [date, setDate] = useState(today);
  const [calendarMonth, setCalendarMonth] = useState(today.slice(0, 7));
  const [horizon, setHorizon] = useState<30 | 60>(30);
  const [searchSlots, setSearchSlots] = useState<PublicBookingSearchSlot[]>([]);
  const [selectedSlot, setSelectedSlot] = useState<PublicBookingSearchSlot | null>(null);
  const [loadingCatalog, setLoadingCatalog] = useState(true);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<PublicBookingResult | null>(null);
  const [patient, setPatient] = useState({
    first_name: "", last_name: "", document_type: "DNI" as IdentityDocumentType,
    document: "", phone: "", email: "", insurance_plan_id: "", website: ""
  });

  const visiblePractices = catalog.practices.filter(practice => !specialtyId || practice.specialty_id === specialtyId);
  const availableDates = useMemo<PublicBookingDate[]>(() => {
    const counts = new Map<string, number>();
    searchSlots.forEach(slot => {
      const key = buenosAiresDate(slot.starts_at);
      counts.set(key, (counts.get(key) || 0) + 1);
    });
    return Array.from(counts, ([availableDate, available_count]) => ({ date: availableDate, available_count }));
  }, [searchSlots]);
  const daySlots = searchSlots.filter(slot => buenosAiresDate(slot.starts_at) === date);
  const doctorOptions = uniqueOptions(searchSlots.map(slot => ({ id: slot.doctor_id, label: slot.doctor_name })));
  const locationOptions = uniqueOptions(searchSlots.map(slot => ({ id: slot.location_id, label: slot.location_name })));
  const nextAvailableDays = availableDates.filter(item => item.date >= today).slice(0, 8);

  useEffect(() => {
    Promise.all([
      getPublicCommercialCatalog(organizationSlug),
      listPublicBookingInsurancePlans(organizationSlug),
      getOrganizationSettings(organizationSlug)
    ]).then(([catalogData, planItems, organizationData]) => {
      setCatalog(catalogData);
      setInsurancePlans(planItems);
      setOrganization(organizationData);
      const requestedDoctor = params.get("profesional") || params.get("doctor") || "";
      const professional = catalogData.professionals.find(item => item.id === requestedDoctor);
      const requested = params.get("especialidad");
      const initialSpecialty = requested && catalogData.specialties.some(item => item.id === requested)
        ? requested
        : professional?.specialty_ids[0] || catalogData.specialties[0]?.id || "";
      const initialPractices = catalogData.practices.filter(item => item.specialty_id === initialSpecialty && (!professional || professional.practice_ids.includes(item.id)));
      setSpecialtyId(initialSpecialty);
      setDoctorId(professional?.id || "");
      setPracticeIds(initialPractices[0] ? [initialPractices[0].id] : []);
    }).catch(err => setError(err instanceof Error ? err.message : "No se pudo cargar la agenda pública."))
      .finally(() => setLoadingCatalog(false));
  }, [organizationSlug]);

  useEffect(() => {
    setSelectedSlot(null);
    if (!specialtyId || practiceIds.length === 0) {
      setSearchSlots([]);
      return;
    }
    let cancelled = false;
    setLoadingSlots(true);
    setError("");
    searchPublicBookingSlots({
      organizationSlug, specialtyId, practiceIds, doctorId: doctorId || undefined,
      locationId: locationId || undefined, from: today, to: addDays(today, horizon)
    }).then(items => {
      if (cancelled) return;
      setSearchSlots(items);
      const firstDate = items[0] ? buenosAiresDate(items[0].starts_at) : today;
      setDate(firstDate);
      setCalendarMonth(firstDate.slice(0, 7));
    }).catch(err => { if (!cancelled) setError(err instanceof Error ? err.message : "No se pudieron buscar turnos."); })
      .finally(() => { if (!cancelled) setLoadingSlots(false); });
    return () => { cancelled = true; };
  }, [specialtyId, practiceIds.join("|"), doctorId, locationId, horizon, today, organizationSlug]);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!selectedSlot) return setError("Elegí un horario disponible.");
    if (!patient.first_name.trim() || !patient.last_name.trim()) return setError("Nombre y apellido son obligatorios.");
    if (!normalizeDocumentNumber(patient.document_type, patient.document)) return setError("Ingresá el número de documento.");
    if (!patient.phone.trim() && !patient.email.trim()) return setError("Ingresá WhatsApp o email para confirmar el turno.");
    setSaving(true);
    setError("");
    try {
      const booking = await requestCatalogBooking({
        doctor_id: selectedSlot.doctor_id,
        starts_at: selectedSlot.starts_at,
        practice_ids: practiceIds,
        ...patient
      });
      setResult(booking);
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo solicitar el turno.");
      setSelectedSlot(null);
    } finally {
      setSaving(false);
    }
  }

  if (result) return <BookingConfirmation result={result} organization={organization} />;

  return (
    <div className="public-booking-page" style={organizationTheme(organization)}>
      <BookingBrand organization={organization} showLogin />
      <main className="public-booking-main">
        <div className="public-booking-title">
          <div><span>Reserva online</span><h1>Solicitar turno</h1><p>Buscá por especialidad. El profesional y el centro aparecen en cada opción disponible.</p></div>
          <ol><li className="active">Búsqueda</li><li className={selectedSlot ? "active" : ""}>Datos</li><li>Confirmación</li></ol>
        </div>
        <form className="public-booking-layout" onSubmit={submit}>
          <section className="public-booking-agenda">
            <SectionTitle number="1" title="¿Qué atención necesitás?" subtitle="Elegí una especialidad y una o más prácticas." />
            <div className="public-specialty-options">
              {catalog.specialties.map(specialty => <button type="button" key={specialty.id} className={specialtyId === specialty.id ? "active" : ""} onClick={() => { const options = catalog.practices.filter(item => item.specialty_id === specialty.id); setSpecialtyId(specialty.id); setPracticeIds(options[0] ? [options[0].id] : []); setDoctorId(""); setLocationId(""); }}>{specialty.name}</button>)}
            </div>
            {loadingCatalog && <p className="empty-day">Cargando opciones...</p>}
            <fieldset className="public-practice-picker"><legend>Prácticas disponibles</legend>
              {visiblePractices.map(practice => <label key={practice.id} className={`practice-tone-${practiceTone(practice.name)} ${practiceIds.includes(practice.id) ? "selected" : ""}`}><input type="checkbox" checked={practiceIds.includes(practice.id)} onChange={() => setPracticeIds(current => current.includes(practice.id) ? current.filter(id => id !== practice.id) : [...current, practice.id])} /><span><strong>{practice.name}</strong><small>{practice.duration_min} min</small></span></label>)}
              {!loadingCatalog && specialtyId && !visiblePractices.length && <p>No hay prácticas publicadas para esta especialidad.</p>}
            </fieldset>

            {practiceIds.length > 0 && <>
              <SectionTitle number="2" title="Elegí un turno disponible" subtitle="Primero te mostramos las fechas más próximas. Si preferís, filtrá por profesional o centro." />
              {(doctorOptions.length > 1 || locationOptions.length > 1) && <div className="public-booking-filters">
                {doctorOptions.length > 1 && <div><strong>Profesional</strong><div className="filter-chips"><button type="button" className={!doctorId ? "active" : ""} onClick={() => setDoctorId("")}>Cualquiera</button>{doctorOptions.map(item => <button type="button" key={item.id} className={doctorId === item.id ? "active" : ""} onClick={() => setDoctorId(item.id)}>{item.label}</button>)}</div></div>}
                {locationOptions.length > 1 && <div><strong>Centro</strong><div className="filter-chips"><button type="button" className={!locationId ? "active" : ""} onClick={() => setLocationId("")}>Todos</button>{locationOptions.map(item => <button type="button" key={item.id} className={locationId === item.id ? "active" : ""} onClick={() => setLocationId(item.id)}>{item.label}</button>)}</div></div>}
              </div>}
              {nextAvailableDays.length > 0 && <div className="availability-day-strip" aria-label="Próximas fechas disponibles">
                {nextAvailableDays.map(item => <button type="button" key={item.date} className={date === item.date ? "active" : ""} onClick={() => { setDate(item.date); setCalendarMonth(item.date.slice(0, 7)); }}><span>{new Date(`${item.date}T12:00:00`).toLocaleDateString("es-AR", { weekday: "short" })}</span><strong>{new Date(`${item.date}T12:00:00`).toLocaleDateString("es-AR", { day: "2-digit", month: "short" })}</strong><small>{item.available_count} {item.available_count === 1 ? "turno" : "turnos"}</small></button>)}
              </div>}
              <div className="public-date-time-picker">
                <PublicBookingCalendar month={calendarMonth} selectedDate={date} availableDates={availableDates} minDate={today} maxDate={addDays(today, horizon)} onMonthChange={setCalendarMonth} onSelect={setDate} />
                <div className="public-times-panel">
                  <strong>{formatLongDate(date)}</strong>
                  {loadingSlots && <p className="empty-day">Buscando los próximos turnos...</p>}
                  {!loadingSlots && <div className="public-slot-grid">{daySlots.map(slot => <SlotButton key={`${slot.starts_at}-${slot.doctor_id}-${slot.location_id}`} slot={slot} selected={selectedSlot?.starts_at === slot.starts_at && selectedSlot.doctor_id === slot.doctor_id} onSelect={setSelectedSlot} />)}</div>}
                  {!loadingSlots && daySlots.length === 0 && <p className="empty-day">No hay horarios libres ese día. Elegí una fecha resaltada.</p>}
                </div>
              </div>
              {!loadingSlots && horizon === 30 && <button type="button" className="secondary-action public-expand-search" onClick={() => setHorizon(60)}>Ver disponibilidad hasta 60 días</button>}
            </>}
          </section>

          <section className={`public-patient-form ${selectedSlot ? "ready" : ""}`}>
            <SectionTitle number="3" title="Tus datos" subtitle="Completalos después de elegir el turno." />
            {selectedSlot ? <SelectedSlot slot={selectedSlot} /> : <p className="patient-form-locked">Primero elegí una práctica, una fecha y un horario.</p>}
            <fieldset disabled={!selectedSlot} className="patient-data-fieldset"><div className="public-patient-grid">
              <label>Nombre<input value={patient.first_name} onChange={event => setPatient({ ...patient, first_name: event.target.value })} onBlur={() => setPatient(current => ({ ...current, first_name: formatProperName(current.first_name) }))} /></label>
              <label>Apellido<input value={patient.last_name} onChange={event => setPatient({ ...patient, last_name: event.target.value })} onBlur={() => setPatient(current => ({ ...current, last_name: formatProperName(current.last_name) }))} /></label>
              <label>Tipo de documento<select value={patient.document_type} onChange={event => setPatient({ ...patient, document_type: event.target.value as IdentityDocumentType, document: "" })}>{documentTypeOptions.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>
              <label>Número de documento<input value={formatDocumentNumber(patient.document_type, patient.document, "")} onChange={event => setPatient({ ...patient, document: normalizeDocumentNumber(patient.document_type, event.target.value) })} inputMode="numeric" /></label>
              <label>WhatsApp<input value={patient.phone} onChange={event => setPatient({ ...patient, phone: event.target.value })} placeholder="549..." inputMode="tel" /></label>
              <label>Obra social<select value={patient.insurance_plan_id} onChange={event => setPatient({ ...patient, insurance_plan_id: event.target.value })}><option value="">Particular / sin obra social</option>{insurancePlans.map(plan => <option key={plan.id} value={plan.id}>{plan.name}</option>)}</select></label>
              <label className="full-field">Email<input type="email" value={patient.email} onChange={event => setPatient({ ...patient, email: event.target.value })} /></label>
              <label className="booking-honeypot" aria-hidden="true">Sitio web<input tabIndex={-1} autoComplete="off" value={patient.website} onChange={event => setPatient({ ...patient, website: event.target.value })} /></label>
            </div></fieldset>
            {error && <p className="error public-booking-error">{error}</p>}
            <button className="primary public-submit" disabled={!selectedSlot || saving}>{saving ? "Reservando..." : selectedSlot ? `Reservar con ${selectedSlot.doctor_name}` : "Reservar turno"}</button>
            <small className="privacy-copy">Al reservar, el horario queda asignado. El consultorio podrá solicitar una confirmación de asistencia más adelante.</small>
          </section>
        </form>
      </main>
    </div>
  );
}

function SectionTitle({ number, title, subtitle }: { number: string; title: string; subtitle: string }) {
  return <div className="booking-section-head"><span>{number}</span><div><h2>{title}</h2><p>{subtitle}</p></div></div>;
}

function SlotButton({ slot, selected, onSelect }: { slot: PublicBookingSearchSlot; selected: boolean; onSelect: (slot: PublicBookingSearchSlot) => void }) {
  const value = new Date(slot.starts_at);
  return <button type="button" className={selected ? "public-slot selected" : "public-slot"} onClick={() => onSelect(slot)}><strong>{value.toLocaleTimeString("es-AR", { timeZone: "America/Argentina/Buenos_Aires", hour: "2-digit", minute: "2-digit" })}</strong><span>Con {slot.doctor_name}</span><small>{slot.location_name}</small></button>;
}

function SelectedSlot({ slot }: { slot: PublicBookingSearchSlot }) {
  return <div className="selected-public-slot"><span className="selected-doctor-label">Profesional elegido</span><h3>{slot.doctor_name}</h3><strong>{formatLongDate(buenosAiresDate(slot.starts_at))} · {new Date(slot.starts_at).toLocaleTimeString("es-AR", { timeZone: "America/Argentina/Buenos_Aires", hour: "2-digit", minute: "2-digit" })}</strong><small>{slot.location_name}{slot.location_address ? ` · ${slot.location_address}` : ""}</small></div>;
}

function BookingConfirmation({ result, organization }: { result: PublicBookingResult; organization: OrganizationSettings | null }) {
  const startsAt = new Date(result.starts_at);
  return <div className="public-booking-page" style={organizationTheme(organization)}><BookingBrand organization={organization} /><main className="public-booking-main confirmation-view"><section className="public-confirmation"><span className="confirmation-mark">OK</span><h1>Turno reservado</h1><p>El horario ya quedó asignado. Guardá estos datos para tu atención.</p><dl><div><dt>Profesional</dt><dd>{result.doctor_name}</dd></div><div><dt>Fecha</dt><dd>{startsAt.toLocaleDateString("es-AR", { timeZone: "America/Argentina/Buenos_Aires", weekday: "long", day: "2-digit", month: "long", year: "numeric" })}</dd></div><div><dt>Hora</dt><dd>{startsAt.toLocaleTimeString("es-AR", { timeZone: "America/Argentina/Buenos_Aires", hour: "2-digit", minute: "2-digit" })}</dd></div><div><dt>Centro</dt><dd>{result.location_name}{result.location_address ? ` · ${result.location_address}` : ""}</dd></div><div><dt>Estado</dt><dd>Reservado</dd></div></dl><button className="primary" onClick={() => window.location.reload()}>Solicitar otro turno</button></section></main></div>;
}

function BookingBrand({ organization, showLogin = false }: { organization: OrganizationSettings | null; showLogin?: boolean }) {
  const logo = organization?.logo_path ? organizationLogoUrl(organization.logo_path) : "";
  return <header className="public-booking-header">{logo ? <img className="public-booking-logo" src={logo} alt={organization?.commercial_name || "Institución"} /> : <span className="brand">SP</span>}<div><strong>{organization?.commercial_name || "Atención médica"}</strong><small>Turnos online</small></div>{showLogin && <a href="/login">Acceso profesionales</a>}</header>;
}

function organizationTheme(organization: OrganizationSettings | null): React.CSSProperties {
  return { "--public-primary": organization?.primary_color || "#176f78", "--public-secondary": organization?.secondary_color || "#dff4ee" } as React.CSSProperties;
}

function PublicBookingCalendar({ month, selectedDate, availableDates, minDate, maxDate, onMonthChange, onSelect }: { month: string; selectedDate: string; availableDates: PublicBookingDate[]; minDate: string; maxDate: string; onMonthChange: (month: string) => void; onSelect: (date: string) => void }) {
  const [year, monthNumber] = month.split("-").map(Number);
  const monthDate = new Date(year, monthNumber - 1, 1);
  const firstWeekday = (monthDate.getDay() + 6) % 7;
  const daysInMonth = new Date(year, monthNumber, 0).getDate();
  const available = new Map(availableDates.map(item => [item.date, item.available_count]));
  const previousMonth = toDateInputValue(new Date(year, monthNumber - 2, 1)).slice(0, 7);
  const nextMonth = toDateInputValue(new Date(year, monthNumber, 1)).slice(0, 7);
  const canGoPrevious = `${previousMonth}-01` >= `${minDate.slice(0, 7)}-01`;
  const canGoNext = `${nextMonth}-01` <= `${maxDate.slice(0, 7)}-01`;
  return <div className="public-calendar" aria-label="Fechas disponibles"><div className="public-calendar-head"><button type="button" aria-label="Mes anterior" disabled={!canGoPrevious} onClick={() => onMonthChange(previousMonth)}>&lt;</button><strong>{monthDate.toLocaleDateString("es-AR", { month: "long", year: "numeric" })}</strong><button type="button" aria-label="Mes siguiente" disabled={!canGoNext} onClick={() => onMonthChange(nextMonth)}>&gt;</button></div><div className="public-calendar-grid public-calendar-weekdays">{["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"].map(day => <span key={day}>{day}</span>)}</div><div className="public-calendar-grid">{Array.from({ length: firstWeekday }, (_, index) => <span className="calendar-empty" key={`empty-${index}`} />)}{Array.from({ length: daysInMonth }, (_, index) => { const day = index + 1; const key = toDateInputValue(new Date(year, monthNumber - 1, day)); const count = available.get(key) || 0; const enabled = key >= minDate && key <= maxDate && count > 0; return <button type="button" key={key} disabled={!enabled} className={selectedDate === key ? "available selected" : enabled ? "available" : ""} onClick={() => onSelect(key)}><strong>{day}</strong>{count > 0 && <small>{count}</small>}</button>; })}</div><p><span /> Días con turnos disponibles</p></div>;
}

function addDays(date: string, days: number) { const value = new Date(`${date}T12:00:00`); value.setDate(value.getDate() + days); return toDateInputValue(value); }
function buenosAiresDate(value: string) { return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Argentina/Buenos_Aires", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(value)); }
function formatLongDate(value: string) { return new Date(`${value}T12:00:00`).toLocaleDateString("es-AR", { weekday: "long", day: "2-digit", month: "long" }); }
function uniqueOptions(items: Array<{ id: string; label: string }>) { const values = new Map<string, string>(); items.forEach(item => values.set(item.id, item.label)); return Array.from(values, ([id, label]) => ({ id, label })); }
function practiceTone(name: string) {
  const value = name.toLocaleLowerCase("es-AR");
  if (value.includes("consulta")) return 0;
  if (value.includes("electro")) return 1;
  if (value.includes("ergometr")) return 2;
  if (value.includes("mapa")) return 3;
  if (value.includes("holter")) return 4;
  return 5;
}
