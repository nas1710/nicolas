import React, { useEffect, useState } from "react";
import { CommercialAdminCatalog, CommercialProfessional, createCommercialPractice, createCommercialSpecialty, getCommercialAdminCatalog, setProfessionalCommercialProfile, updateCommercialPractice, updateCommercialSpecialty } from "../../api/supabase";

export function CommercialCatalogManager() {
  const [data, setData] = useState<CommercialAdminCatalog | null>(null);
  const [specialtyName, setSpecialtyName] = useState("");
  const [practice, setPractice] = useState({ specialty_id: "", name: "", duration_min: 15 });
  const [status, setStatus] = useState("");
  async function refresh() { setData(await getCommercialAdminCatalog()); }
  useEffect(() => { refresh().catch(error => setStatus(error instanceof Error ? error.message : "No se pudo cargar el catalogo.")); }, []);
  if (!data) return <section className="panel admin-section wide"><h2>Catálogo público</h2><p>{status || "Cargando..."}</p></section>;
  return <section className="panel admin-section wide commercial-manager">
    <div><h2>Catálogo público</h2><p>Especialidades, prácticas y profesionales que aparecen en la web y la turnera.</p></div>
    <div className="commercial-create-grid">
      <form onSubmit={async event => { event.preventDefault(); if (!specialtyName.trim()) return; await createCommercialSpecialty({ name: specialtyName }); setSpecialtyName(""); await refresh(); }}><strong>Nueva especialidad</strong><input value={specialtyName} onChange={event => setSpecialtyName(event.target.value)} placeholder="Ej. Clínica médica" /><button className="primary">Agregar</button></form>
      <form onSubmit={async event => { event.preventDefault(); if (!practice.specialty_id || !practice.name.trim()) return; await createCommercialPractice(practice); setPractice({ ...practice, name: "" }); await refresh(); }}><strong>Nueva práctica</strong><select value={practice.specialty_id} onChange={event => setPractice({ ...practice, specialty_id: event.target.value })}><option value="">Especialidad</option>{data.specialties.filter(item => item.active).map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select><input value={practice.name} onChange={event => setPractice({ ...practice, name: event.target.value })} placeholder="Nombre" /><select value={practice.duration_min} onChange={event => setPractice({ ...practice, duration_min: Number(event.target.value) })}>{Array.from({ length: 12 }, (_, index) => (index + 1) * 5).map(value => <option key={value} value={value}>{value} min</option>)}</select><button className="primary">Agregar</button></form>
    </div>
    <details open><summary>Especialidades ({data.specialties.length})</summary><div className="commercial-rows">{data.specialties.map(item => <div key={item.id}><strong>{item.name}</strong><label><input type="checkbox" checked={item.published} onChange={async () => { await updateCommercialSpecialty(item.id, { published: !item.published }); await refresh(); }} />Publicada</label><label><input type="checkbox" checked={item.active} onChange={async () => { await updateCommercialSpecialty(item.id, { active: !item.active }); await refresh(); }} />Activa</label></div>)}</div></details>
    <details><summary>Prácticas ({data.practices.length})</summary><div className="commercial-rows">{data.practices.map(item => <div key={item.id}><strong>{item.name}</strong><span>{data.specialties.find(s => s.id === item.specialty_id)?.name} · {item.duration_min} min</span><label><input type="checkbox" checked={item.published} onChange={async () => { await updateCommercialPractice(item.id, { published: !item.published }); await refresh(); }} />Publicada</label><label><input type="checkbox" checked={item.active} onChange={async () => { await updateCommercialPractice(item.id, { active: !item.active }); await refresh(); }} />Activa</label></div>)}</div></details>
    <details><summary>Profesionales publicados ({data.professionals.length})</summary><div className="commercial-professionals">{data.professionals.map(item => <ProfessionalCatalogRow key={item.id} professional={item} data={data} onSaved={refresh} />)}</div></details>
    {status && <p className="notice">{status}</p>}
  </section>;
}

function ProfessionalCatalogRow({ professional, data, onSaved }: { professional: CommercialProfessional; data: CommercialAdminCatalog; onSaved: () => Promise<void> }) {
  const [published, setPublished] = useState(professional.public_booking_enabled);
  const [specialties, setSpecialties] = useState(professional.specialty_ids);
  const [practices, setPractices] = useState(professional.practice_ids);
  const toggle = (list: string[], id: string) => list.includes(id) ? list.filter(value => value !== id) : [...list, id];
  return <article><div><strong>{professional.full_name}</strong><label><input type="checkbox" checked={published} onChange={event => setPublished(event.target.checked)} />Publicado</label></div><fieldset><legend>Especialidades</legend>{data.specialties.filter(item => item.active).map(item => <label key={item.id}><input type="checkbox" checked={specialties.includes(item.id)} onChange={() => setSpecialties(toggle(specialties, item.id))} />{item.name}</label>)}</fieldset><fieldset><legend>Prácticas</legend>{data.practices.filter(item => item.active && specialties.includes(item.specialty_id)).map(item => <label key={item.id}><input type="checkbox" checked={practices.includes(item.id)} onChange={() => setPractices(toggle(practices, item.id))} />{item.name}</label>)}</fieldset><button className="primary" onClick={async () => { await setProfessionalCommercialProfile({ professional_id: professional.id, published, specialty_ids: specialties, practice_ids: practices }); await onSaved(); }}>Guardar publicación</button></article>;
}
