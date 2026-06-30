import { IdentityDocumentType } from "../api/supabase";

export const documentTypeOptions: Array<{ value: IdentityDocumentType; label: string }> = [
  { value: "DNI", label: "DNI" },
  { value: "LC", label: "Libreta Civica (LC)" },
  { value: "LE", label: "Libreta de Enrolamiento (LE)" },
  { value: "PASAPORTE", label: "Pasaporte" },
  { value: "CEDULA_IDENTIDAD", label: "Cedula de identidad" },
  { value: "DOCUMENTO_EXTRANJERO", label: "Documento extranjero" }
];

export function documentTypeLabel(type?: IdentityDocumentType) {
  return documentTypeOptions.find(option => option.value === (type || "DNI"))?.label || "Documento";
}
