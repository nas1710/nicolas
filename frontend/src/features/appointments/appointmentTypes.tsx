import { Appointment } from "../../api/supabase";

export type AppointmentTypeCode = "CONSULTA" | "ELECTROCARDIOGRAMA" | "ERGOMETRIA" | "MAPA" | "HOLTER";

export function appointmentTypeOptions() {
  return [
    { value: "CONSULTA" as AppointmentTypeCode, label: "Consulta" },
    { value: "ELECTROCARDIOGRAMA" as AppointmentTypeCode, label: "Electrocardiograma" },
    { value: "ERGOMETRIA" as AppointmentTypeCode, label: "Ergometria" },
    { value: "MAPA" as AppointmentTypeCode, label: "MAPA" },
    { value: "HOLTER" as AppointmentTypeCode, label: "Holter" }
  ];
}

export function appointmentTypeLabel(value: string) {
  return decodeAppointmentTypes(value).map(type => appointmentTypeOptions().find(option => option.value === type)?.label || type).join(" + ");
}

export function appointmentTypeClass(value: string) {
  return `type-${value.toLowerCase().replace(/_/g, "-")}`;
}

export function primaryAppointmentTypeClass(value: string) {
  return appointmentTypeClass(decodeAppointmentTypes(value)[0] || "CONSULTA");
}

export function decodeAppointmentTypes(value: string): AppointmentTypeCode[] {
  const valid = appointmentTypeOptions().map(option => option.value);
  const values = (value || "").split("+").filter((item): item is AppointmentTypeCode => valid.includes(item as AppointmentTypeCode));
  return values.length ? values : ["CONSULTA"];
}

export function encodeAppointmentTypes(values: AppointmentTypeCode[]) {
  const unique = appointmentTypeOptions().map(option => option.value).filter(value => values.includes(value));
  return (unique.length ? unique : ["CONSULTA"]).join("+");
}

const appointmentTypesPrefix = "[[MOTIVOS_TURNO:";
const appointmentTypesSuffix = "]]";

export function buildAppointmentTypePayload(types: AppointmentTypeCode[], reason: string) {
  const cleanTypes = decodeAppointmentTypes(encodeAppointmentTypes(types));
  const cleanReason = reason.trim();
  const encodedTypes = encodeAppointmentTypes(cleanTypes);
  return {
    type: cleanTypes[0],
    reason: cleanTypes.length > 1
      ? `${appointmentTypesPrefix}${encodedTypes}${appointmentTypesSuffix}${cleanReason ? `\n${cleanReason}` : ""}`
      : cleanReason
  };
}

export function appointmentTypeValue(appointment: Appointment) {
  return extractAppointmentTypes(appointment.reason) || appointment.type;
}

export function extractAppointmentTypes(reason?: string | null) {
  const match = (reason || "").match(/^\[\[MOTIVOS_TURNO:([A-Z_+]+)\]\]/);
  return match?.[1] || "";
}

export function visibleAppointmentReason(reason?: string | null) {
  return (reason || "").replace(/^\[\[MOTIVOS_TURNO:[A-Z_+]+\]\]\s*/, "").trim();
}

export function AppointmentTypeLabels({ value }: { value: string }) {
  return (
    <span className="type-labels">
      {decodeAppointmentTypes(value).map(type => (
        <span className={`type-label ${appointmentTypeClass(type)}`} key={type}>{appointmentTypeLabel(type)}</span>
      ))}
    </span>
  );
}

export function AppointmentTypePicker({ value, onChange }: { value: AppointmentTypeCode[]; onChange: (value: AppointmentTypeCode[]) => void }) {
  function toggle(type: AppointmentTypeCode) {
    const next = value.includes(type) ? value.filter(item => item !== type) : [...value, type];
    onChange(next.length ? next : ["CONSULTA"]);
  }

  return (
    <fieldset className="appointment-type-picker">
      <legend>Motivo del turno</legend>
      <div>
        {appointmentTypeOptions().map(option => (
          <label className={`type-choice ${appointmentTypeClass(option.value)}`} key={option.value}>
            <input type="checkbox" checked={value.includes(option.value)} onChange={() => toggle(option.value)} />
            <span>{option.label}</span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}
