import React, { useEffect, useMemo, useState } from "react";
import { createSignedSignatureUrl, getOrganizationSettings, organizationLogoUrl, type Appointment, type ClinicalEvolution, type OrganizationSettings, type Patient, type Profile } from "../../api/supabase";
import { documentKindLabels, InstitutionalDocumentKind, printInstitutionalPdf } from "./institutionalPdf";

export function InstitutionalDocumentDialog({ patient, profile, onClose }: { patient: Patient; profile: Profile; onClose: () => void }) {
  const [kind, setKind] = useState<InstitutionalDocumentKind>("HISTORY");
  const [signatureUrl, setSignatureUrl] = useState("");
  const [organization,setOrganization]=useState<OrganizationSettings|null>(null);
  const latestEvolution = useMemo(() => [...(patient.clinical_evolutions || [])].sort((a, b) => new Date(b.occurred_at).getTime() - new Date(a.occurred_at).getTime())[0], [patient]);
  const latestAppointment = useMemo(() => [...(patient.appointments || [])].filter(item => item.status !== "CANCELADO").sort((a, b) => new Date(b.starts_at).getTime() - new Date(a.starts_at).getTime())[0], [patient]);
  useEffect(() => { if (profile.signature_path) createSignedSignatureUrl(profile.signature_path).then(setSignatureUrl).catch(() => setSignatureUrl("")); }, [profile.signature_path]);
  useEffect(()=>{getOrganizationSettings().then(setOrganization).catch(()=>setOrganization(null));},[]);

  return (
    <div className="modal-backdrop document-preview-backdrop" role="dialog" aria-modal="true" aria-label="Generar documento PDF">
      <div className="document-generator">
        <header className="document-generator-head">
          <div><span>Documento institucional</span><h2>Preparar PDF</h2><p>{patient.last_name}, {patient.first_name}</p></div>
          <button type="button" className="secondary-action" onClick={onClose}>Cerrar</button>
        </header>
        <div className="document-generator-layout">
          <aside className="document-kind-list" aria-label="Tipo de documento">
            {(Object.keys(documentKindLabels) as InstitutionalDocumentKind[]).map(option => (
              <button type="button" key={option} className={kind === option ? "active" : ""} onClick={() => setKind(option)}>{documentKindLabels[option]}</button>
            ))}
          </aside>
          <article className="document-a4-preview">
            <div className="document-preview-brand">{organization?.logo_path?<img src={organizationLogoUrl(organization.logo_path)} alt="Logo institucional"/>:<span>SP</span>}<div><strong>{organization?.commercial_name||profile.institution_name || "Documento asistencial"}</strong><small>{profile.full_name} - {profile.specialty || profile.public_booking_specialty || "Profesional de la salud"}</small></div></div>
            <h1>{documentKindLabels[kind]}</h1>
            <div className="document-preview-patient"><strong>{patient.last_name}, {patient.first_name}</strong><span>{patient.document_type} {patient.document || "No informado"}</span><span>{patient.insurance_plans?.name || "Obra social no informada"}</span></div>
            <DocumentPreviewBody kind={kind} latestEvolution={latestEvolution} latestAppointment={latestAppointment} evolutionCount={patient.clinical_evolutions?.length || 0} />
            <div className="document-preview-signature">{signatureUrl && <img src={signatureUrl} alt="Firma profesional" />}<span /><strong>{profile.signature_name || profile.full_name}</strong><small>{profile.specialty || profile.public_booking_specialty || "Profesional de la salud"}</small><small>{profile.professional_license ? `M.P. ${profile.professional_license.replace(/^M\.?P\.?\s*/i, "")}` : "Matricula no informada"}</small></div>
            <footer>{organization?.legal_text||profile.institutional_footer || "Documento confidencial generado por el sistema de gestion asistencial."}</footer>
          </article>
        </div>
        <div className="document-generator-actions">
          <span>Se abrirá el diálogo de impresión. Allí podés imprimir o guardar como PDF.</span>
          <button type="button" className="primary" onClick={() => void printInstitutionalPdf({ patient, profile, kind, organization })}>Imprimir / guardar PDF</button>
        </div>
      </div>
    </div>
  );
}

function DocumentPreviewBody({ kind, latestEvolution, latestAppointment, evolutionCount }: { kind: InstitutionalDocumentKind; latestEvolution?: ClinicalEvolution; latestAppointment?: Appointment; evolutionCount: number }) {
  if (kind === "HISTORY") return <section><h3>Evoluciones clinicas</h3><p>{evolutionCount ? `${evolutionCount} evoluciones ordenadas cronologicamente.` : "Sin evoluciones clinicas registradas."}</p></section>;
  if (kind === "ATTENDANCE_CERTIFICATE") return <section><h3>Constancia</h3><p>Constancia de atención del paciente por el profesional firmante.</p></section>;
  if (kind === "APPOINTMENT_SUMMARY") return <section><h3>Atencion</h3><p>{latestAppointment?.reason || latestEvolution?.reason || "Consulta"}</p><p>{latestAppointment?.locations?.name || "Centro de atencion no informado"}</p></section>;
  if (kind === "INDICATIONS") return <section><h3>Indicaciones para el paciente</h3><p>{latestEvolution?.indications || "No se registraron indicaciones para la ultima atencion."}</p></section>;
  return <section><h3>{latestEvolution?.reason || "Informe"}</h3><p>{latestEvolution?.diagnosis || "Diagnostico no informado"}</p><p>{latestEvolution?.notes || "Sin contenido clinico registrado."}</p></section>;
}
