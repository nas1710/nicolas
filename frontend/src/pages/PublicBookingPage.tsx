import React, { useEffect, useState } from "react";
import {
  formatDocumentNumber,
  formatProperName,
  IdentityDocumentType,
  InsurancePlan,
  listPublicBookingDates,
  listPublicBookingDoctors,
  listPublicBookingInsurancePlans,
  listPublicBookingSlots,
  normalizeDocumentNumber,
  PublicBookingDate,
  PublicBookingDoctor,
  PublicBookingResult,
  PublicBookingSlot,
  requestPublicBooking
} from "../api/supabase";
import { AppointmentTypeCode, AppointmentTypePicker } from "../features/appointments/appointmentTypes";
import { useBuenosAiresClock } from "../hooks/useBuenosAiresClock";
import { toDateInputValue } from "../utils/dates";
import { documentTypeOptions } from "../utils/identity";

export function PublicBookingPage() {
  const officialClock = useBuenosAiresClock();
  const today = officialClock.today;
  const maxDateValue = new Date(`${today}T12:00:00`);
  maxDateValue.setDate(maxDateValue.getDate() + 90);
  const [doctors, setDoctors] = useState<PublicBookingDoctor[]>([]);
  const [insurancePlans, setInsurancePlans] = useState<Pick<InsurancePlan, "id" | "name">[]>([]);
  const [doctorId, setDoctorId] = useState("");
  const [types, setTypes] = useState<AppointmentTypeCode[]>(["CONSULTA"]);
  const [date, setDate] = useState(today);
  const [calendarMonth, setCalendarMonth] = useState(today.slice(0, 7));
  const [availableDates, setAvailableDates] = useState<PublicBookingDate[]>([]);
  const [loadingDates, setLoadingDates] = useState(false);
  const [slots, setSlots] = useState<PublicBookingSlot[]>([]);
  const [selectedSlot, setSelectedSlot] = useState<PublicBookingSlot | null>(null);
  const [loadingCatalog, setLoadingCatalog] = useState(true);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<PublicBookingResult | null>(null);
  const [patient, setPatient] = useState({
    first_name: "",
    last_name: "",
    document_type: "DNI" as IdentityDocumentType,
    document: "",
    phone: "",
    email: "",
    insurance_plan_id: "",
    website: ""
  });
  const duration = publicBookingDuration(types);

  useEffect(() => {
    Promise.all([listPublicBookingDoctors(), listPublicBookingInsurancePlans()])
      .then(([doctorItems, planItems]) => {
        setDoctors(doctorItems);
        setInsurancePlans(planItems);
        if (doctorItems.length === 1) setDoctorId(doctorItems[0].id);
      })
      .catch(err => setError(err instanceof Error ? err.message : "No se pudo cargar la agenda publica."))
      .finally(() => setLoadingCatalog(false));
  }, []);

  useEffect(() => {
    if (!doctorId || types.length === 0) {
      setAvailableDates([]);
      setLoadingDates(false);
      return;
    }
    const { first, last } = calendarMonthBounds(calendarMonth, today, toDateInputValue(maxDateValue));
    if (!first || !last) {
      setAvailableDates([]);
      setLoadingDates(false);
      return;
    }
    let cancelled = false;
    setLoadingDates(true);
    listPublicBookingDates(doctorId, first, last, duration)
      .then(items => {
        if (cancelled) return;
        setAvailableDates(items);
        if (!items.some(item => item.date === date) && items[0]) setDate(items[0].date);
      })
      .catch(err => { if (!cancelled) setError(err instanceof Error ? err.message : "No se pudo cargar el almanaque."); })
      .finally(() => { if (!cancelled) setLoadingDates(false); });
    return () => { cancelled = true; };
  }, [doctorId, calendarMonth, duration]);

  useEffect(() => {
    setSelectedSlot(null);
    if (!doctorId || !date || types.length === 0) {
      setSlots([]);
      return;
    }
    setLoadingSlots(true);
    setError("");
    let cancelled = false;
    listPublicBookingSlots(doctorId, date, duration)
      .then(items => { if (!cancelled) setSlots(items); })
      .catch(err => { if (!cancelled) setError(err instanceof Error ? err.message : "No se pudieron consultar los horarios."); })
      .finally(() => { if (!cancelled) setLoadingSlots(false); });
    return () => { cancelled = true; };
  }, [doctorId, date, duration]);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!doctorId) return setError("Elegir profesional.");
    if (!selectedSlot) return setError("Elegir un horario disponible.");
    if (!patient.first_name.trim() || !patient.last_name.trim()) return setError("Nombre y apellido son obligatorios.");
    if (!normalizeDocumentNumber(patient.document_type, patient.document)) return setError("Ingresar el numero de documento.");
    if (!patient.phone.trim() && !patient.email.trim()) return setError("Ingresar telefono o email para poder confirmar el turno.");

    setSaving(true);
    setError("");
    try {
      const booking = await requestPublicBooking({ doctor_id: doctorId, starts_at: selectedSlot.starts_at, types, ...patient });
      setResult(booking);
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo solicitar el turno.");
      const refreshed = await listPublicBookingSlots(doctorId, date, duration).catch(() => []);
      setSlots(refreshed);
      if (!refreshed.some(slot => slot.starts_at === selectedSlot.starts_at && slot.location_id === selectedSlot.location_id)) setSelectedSlot(null);
    } finally {
      setSaving(false);
    }
  }

  if (result) {
    const startsAt = new Date(result.starts_at);
    return (
      <div className="public-booking-page">
        <header className="public-booking-header"><span className="brand">SP</span><div><strong>Cardio Ayala</strong><small>Turnos online</small></div></header>
        <main className="public-booking-main confirmation-view">
          <section className="public-confirmation">
            <span className="confirmation-mark">OK</span>
            <h1>Solicitud recibida</h1>
            <p>El consultorio revisara la solicitud y confirmara el turno por tus datos de contacto.</p>
            <dl>
              <div><dt>Profesional</dt><dd>{result.doctor_name}</dd></div>
              <div><dt>Fecha</dt><dd>{startsAt.toLocaleDateString("es-AR", { weekday: "long", day: "2-digit", month: "long", year: "numeric" })}</dd></div>
              <div><dt>Hora</dt><dd>{startsAt.toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" })}</dd></div>
              <div><dt>Consultorio</dt><dd>{result.location_name}{result.location_address ? ` · ${result.location_address}` : ""}</dd></div>
              <div><dt>Estado</dt><dd>Pendiente de confirmacion</dd></div>
            </dl>
            <button className="primary" onClick={() => window.location.reload()}>Solicitar otro turno</button>
          </section>
        </main>
      </div>
    );
  }

  return (
    <div className="public-booking-page">
      <header className="public-booking-header">
        <span className="brand">SP</span>
        <div><strong>Cardio Ayala</strong><small>Turnos online</small></div>
        <a href="/">Acceso profesionales</a>
      </header>
      <main className="public-booking-main">
        <div className="public-booking-title">
          <div><span>Reserva online</span><h1>Solicitar turno</h1><p>Elegí profesional, práctica y un horario disponible.</p></div>
          <ol><li className="active">Agenda</li><li className={selectedSlot ? "active" : ""}>Datos</li><li>Confirmación</li></ol>
        </div>
        <form className="public-booking-layout" onSubmit={submit}>
          <section className="public-booking-agenda">
            <div className="booking-section-head"><span>1</span><div><h2>Profesional y práctica</h2><p>El consultorio se asigna automáticamente.</p></div></div>
            {loadingCatalog ? <p className="empty-day">Cargando profesionales...</p> : (
              <div className="doctor-options">
                {doctors.map(doctor => (
                  <button type="button" key={doctor.id} className={doctorId === doctor.id ? "doctor-option selected" : "doctor-option"} onClick={() => setDoctorId(doctor.id)}>
                    <span className="avatar">{doctor.full_name.slice(0, 2).toUpperCase()}</span><span><strong>{doctor.full_name}</strong><small>{doctor.specialty}</small></span>
                  </button>
                ))}
                {!loadingCatalog && doctors.length === 0 && <p className="notice">Todavia no hay profesionales con horarios publicados.</p>}
              </div>
            )}
            <AppointmentTypePicker value={types} onChange={setTypes} />
            <div className="booking-section-head"><span>2</span><div><h2>Fecha y horario</h2><p>Solo se muestran turnos realmente disponibles.</p></div></div>
            <div className="public-date-time-picker">
              <PublicBookingCalendar month={calendarMonth} selectedDate={date} availableDates={availableDates} minDate={today} maxDate={toDateInputValue(maxDateValue)} onMonthChange={setCalendarMonth} onSelect={setDate} />
              <div className="public-times-panel">
                <strong>Horarios del {new Date(`${date}T12:00:00`).toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit" })}</strong>
                {loadingDates && <p className="public-calendar-loading" role="status">Cargando fechas disponibles...</p>}
                <div className="public-slot-grid">
              {loadingSlots && <p className="empty-day">Buscando horarios...</p>}
              {!loadingSlots && doctorId && slots.map(slot => {
                const value = new Date(slot.starts_at);
                return <button type="button" key={`${slot.starts_at}-${slot.location_id}`} className={selectedSlot?.starts_at === slot.starts_at ? "public-slot selected" : "public-slot"} onClick={() => setSelectedSlot(slot)}><strong>{value.toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" })}</strong><small>{slot.location_name}</small></button>;
              })}
              {!loadingSlots && doctorId && slots.length === 0 && <p className="empty-day">No hay horarios libres para esta fecha. Probá otro día.</p>}
              {!doctorId && <p className="empty-day">Elegí un profesional para ver horarios.</p>}
                </div>
              </div>
            </div>
          </section>
          <section className={`public-patient-form ${selectedSlot ? "ready" : ""}`}>
            <div className="booking-section-head"><span>3</span><div><h2>Tus datos</h2><p>Los usamos solamente para identificarte y confirmar el turno.</p></div></div>
            {selectedSlot && <div className="selected-public-slot"><strong>{new Date(selectedSlot.starts_at).toLocaleDateString("es-AR")} · {new Date(selectedSlot.starts_at).toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" })}</strong><span>{selectedSlot.location_name}</span></div>}
            <div className="public-patient-grid">
              <label>Nombre<input value={patient.first_name} onChange={event => setPatient({ ...patient, first_name: event.target.value })} onBlur={() => setPatient(current => ({ ...current, first_name: formatProperName(current.first_name) }))} /></label>
              <label>Apellido<input value={patient.last_name} onChange={event => setPatient({ ...patient, last_name: event.target.value })} onBlur={() => setPatient(current => ({ ...current, last_name: formatProperName(current.last_name) }))} /></label>
              <label>Tipo de documento<select value={patient.document_type} onChange={event => setPatient({ ...patient, document_type: event.target.value as IdentityDocumentType, document: "" })}>{documentTypeOptions.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>
              <label>Numero de documento<input value={formatDocumentNumber(patient.document_type, patient.document, "")} onChange={event => setPatient({ ...patient, document: normalizeDocumentNumber(patient.document_type, event.target.value) })} inputMode="numeric" /></label>
              <label>WhatsApp<input value={patient.phone} onChange={event => setPatient({ ...patient, phone: event.target.value })} placeholder="549..." inputMode="tel" /></label>
              <label>Obra social<select value={patient.insurance_plan_id} onChange={event => setPatient({ ...patient, insurance_plan_id: event.target.value })}><option value="">Particular / sin obra social</option>{insurancePlans.map(plan => <option key={plan.id} value={plan.id}>{plan.name}</option>)}</select></label>
              <label className="full-field">Email<input type="email" value={patient.email} onChange={event => setPatient({ ...patient, email: event.target.value })} /></label>
              <label className="booking-honeypot" aria-hidden="true">Sitio web<input tabIndex={-1} autoComplete="off" value={patient.website} onChange={event => setPatient({ ...patient, website: event.target.value })} /></label>
            </div>
            {error && <p className="error public-booking-error">{error}</p>}
            <button className="primary public-submit" disabled={!selectedSlot || saving}>{saving ? "Enviando solicitud..." : "Solicitar turno"}</button>
            <small className="privacy-copy">La solicitud queda pendiente hasta que el consultorio la confirme.</small>
          </section>
        </form>
      </main>
    </div>
  );
}

function PublicBookingCalendar({ month, selectedDate, availableDates, minDate, maxDate, onMonthChange, onSelect }: {
  month: string;
  selectedDate: string;
  availableDates: PublicBookingDate[];
  minDate: string;
  maxDate: string;
  onMonthChange: (month: string) => void;
  onSelect: (date: string) => void;
}) {
  const [year, monthNumber] = month.split("-").map(Number);
  const monthDate = new Date(year, monthNumber - 1, 1);
  const firstWeekday = (monthDate.getDay() + 6) % 7;
  const daysInMonth = new Date(year, monthNumber, 0).getDate();
  const available = new Map(availableDates.map(item => [item.date, item.available_count]));
  const previousMonth = toDateInputValue(new Date(year, monthNumber - 2, 1)).slice(0, 7);
  const nextMonth = toDateInputValue(new Date(year, monthNumber, 1)).slice(0, 7);
  const canGoPrevious = `${previousMonth}-01` >= minDate.slice(0, 7) + "-01";
  const canGoNext = `${nextMonth}-01` <= maxDate.slice(0, 7) + "-01";

  return (
    <div className="public-calendar" aria-label="Fechas disponibles">
      <div className="public-calendar-head"><button type="button" aria-label="Mes anterior" disabled={!canGoPrevious} onClick={() => onMonthChange(previousMonth)}>&lt;</button><strong>{monthDate.toLocaleDateString("es-AR", { month: "long", year: "numeric" })}</strong><button type="button" aria-label="Mes siguiente" disabled={!canGoNext} onClick={() => onMonthChange(nextMonth)}>&gt;</button></div>
      <div className="public-calendar-grid public-calendar-weekdays">{["Lun", "Mar", "Mie", "Jue", "Vie", "Sab", "Dom"].map(day => <span key={day}>{day}</span>)}</div>
      <div className="public-calendar-grid">
        {Array.from({ length: firstWeekday }, (_, index) => <span className="calendar-empty" key={`empty-${index}`} />)}
        {Array.from({ length: daysInMonth }, (_, index) => {
          const day = index + 1;
          const key = toDateInputValue(new Date(year, monthNumber - 1, day));
          const count = available.get(key) || 0;
          const enabled = key >= minDate && key <= maxDate && count > 0;
          return <button type="button" key={key} disabled={!enabled} className={selectedDate === key ? "available selected" : enabled ? "available" : ""} onClick={() => onSelect(key)}><strong>{day}</strong>{count > 0 && <small>{count} libres</small>}</button>;
        })}
      </div>
      <p><span /> Días con turnos disponibles</p>
    </div>
  );
}

function calendarMonthBounds(month: string, minDate: string, maxDate: string) {
  const [year, monthNumber] = month.split("-").map(Number);
  const firstOfMonth = toDateInputValue(new Date(year, monthNumber - 1, 1));
  const lastOfMonth = toDateInputValue(new Date(year, monthNumber, 0));
  const first = firstOfMonth < minDate ? minDate : firstOfMonth;
  const last = lastOfMonth > maxDate ? maxDate : lastOfMonth;
  return first <= last ? { first, last } : { first: "", last: "" };
}

function publicBookingDuration(types: AppointmentTypeCode[]) {
  return types.reduce((total, type) => total + (type === "CONSULTA" || type === "ELECTROCARDIOGRAMA" ? 15 : 30), 0);
}
