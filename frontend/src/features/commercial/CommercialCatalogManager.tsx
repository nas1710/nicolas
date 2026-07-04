import { useEffect, useState } from "react";
import {
  CommercialAdminCatalog,
  CommercialProfessional,
  createCommercialPractice,
  createCommercialSpecialty,
  getCommercialAdminCatalog,
  getConfiguration,
  listProfessionalLocationAssignments,
  Location,
  setProfessionalCommercialProfile,
  setProfessionalLocations,
  updateCommercialPractice,
  updateCommercialSpecialty
} from "../../api/supabase";

const durationValues = Array.from({ length: 12 }, (_, index) => (index + 1) * 5);

export function CommercialCatalogManager({ lightMode = false }: { lightMode?: boolean }) {
  const [data, setData] = useState<CommercialAdminCatalog | null>(null);
  const [specialtyName, setSpecialtyName] = useState("");
  const [practice, setPractice] = useState({ specialty_id: "", name: "", duration_min: 15 });
  const [status, setStatus] = useState("");
  const [locations, setLocations] = useState<Location[]>([]);
  const [links, setLinks] = useState<Array<{ professional_id: string; location_id: string }>>([]);

  async function refresh() {
    const [catalog, config, nextLinks] = await Promise.all([getCommercialAdminCatalog(), getConfiguration(), listProfessionalLocationAssignments()]);
    setData(catalog);
    setLocations(config.locations);
    setLinks(nextLinks);
  }

  useEffect(() => { void refresh().catch(error => setStatus(error instanceof Error ? error.message : "No se pudo cargar el catálogo.")); }, []);
  if (!data) return <section className="panel admin-section wide"><h2>{lightMode ? "Prácticas" : "Catálogo público"}</h2><p>{status || "Cargando..."}</p></section>;

  const cardiologySpecialty = data.specialties.find(item => item.active && item.name.toLocaleLowerCase("es-AR").includes("cardio"));
  const effectiveSpecialtyId = lightMode ? cardiologySpecialty?.id || "" : practice.specialty_id;
  const visiblePractices = lightMode ? data.practices.filter(item => item.specialty_id === cardiologySpecialty?.id) : data.practices;

  return <section className="panel admin-section wide commercial-manager">
    <div><h2>{lightMode ? "Prácticas cardiológicas" : "Catálogo público"}</h2><p>{lightMode ? "Definí duración, disponibilidad e indicaciones para cada estudio." : "Especialidades, prácticas, profesionales y lugares publicados."}</p></div>
    <div className={lightMode ? "commercial-create-grid light-practice-create" : "commercial-create-grid"}>
      {!lightMode && <form onSubmit={async event => { event.preventDefault(); if (!specialtyName.trim()) return; await createCommercialSpecialty({ name: specialtyName }); setSpecialtyName(""); await refresh(); }}>
        <strong>Nueva especialidad</strong><input value={specialtyName} onChange={event => setSpecialtyName(event.target.value)} placeholder="Ej. Clínica médica"/><button className="primary">Agregar</button>
      </form>}
      <form onSubmit={async event => { event.preventDefault(); if (!effectiveSpecialtyId || !practice.name.trim()) return; await createCommercialPractice({ ...practice, specialty_id: effectiveSpecialtyId }); setPractice(current => ({ ...current, name: "" })); await refresh(); }}>
        <strong>Nueva práctica</strong>
        {!lightMode && <select value={practice.specialty_id} onChange={event => setPractice({ ...practice, specialty_id: event.target.value })}><option value="">Especialidad</option>{data.specialties.filter(item => item.active).map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select>}
        <input value={practice.name} onChange={event => setPractice({ ...practice, name: event.target.value })} placeholder="Nombre"/>
        <select aria-label="Duración de la práctica" value={practice.duration_min} onChange={event => setPractice({ ...practice, duration_min: Number(event.target.value) })}>{durationValues.map(value => <option key={value} value={value}>{value} min</option>)}</select>
        <button className="primary">Agregar</button>
      </form>
    </div>
    {!lightMode && <details open><summary>Especialidades ({data.specialties.length})</summary><div className="commercial-rows">{data.specialties.map(item => <div key={item.id}><strong>{item.name}</strong><label><input type="checkbox" checked={item.published} onChange={async () => { await updateCommercialSpecialty(item.id, { published: !item.published }); await refresh(); }}/>Publicada</label><label><input type="checkbox" checked={item.active} onChange={async () => { await updateCommercialSpecialty(item.id, { active: !item.active }); await refresh(); }}/>Activa</label></div>)}</div></details>}
    <details open={lightMode}><summary>Prácticas ({visiblePractices.length})</summary><div className="commercial-rows">{visiblePractices.map(item => <PracticeRow key={item.id} item={item} specialty={data.specialties.find(specialty => specialty.id === item.specialty_id)?.name || ""} showSpecialty={!lightMode} onSaved={refresh}/>)}</div></details>
    {!lightMode && <details><summary>Profesionales ({data.professionals.length})</summary><div className="commercial-professionals">{data.professionals.map(item => <ProfessionalRow key={item.id} professional={item} data={data} locations={locations} locationIds={links.filter(link => link.professional_id === item.id).map(link => link.location_id)} onSaved={refresh}/>)}</div></details>}
    {status && <p className="notice">{status}</p>}
  </section>;
}

function PracticeRow({ item, specialty, showSpecialty, onSaved }: { item: CommercialAdminCatalog["practices"][number]; specialty: string; showSpecialty: boolean; onSaved: () => Promise<void> }) {
  const [form, setForm] = useState(item);
  return <div className="practice-catalog-row">
    <div><strong>{item.name}</strong>{showSpecialty && <small>{specialty}</small>}</div>
    <label>Duración<select value={form.duration_min} onChange={event => setForm({ ...form, duration_min: Number(event.target.value) })}>{durationValues.map(value => <option key={value} value={value}>{value} min</option>)}</select></label>
    <label className="compact-check"><input type="checkbox" checked={form.requires_preparation || false} onChange={event => setForm({ ...form, requires_preparation: event.target.checked })}/>Indicaciones previas</label>
    <input value={form.preparation_instructions || ""} disabled={!form.requires_preparation} onChange={event => setForm({ ...form, preparation_instructions: event.target.value })} placeholder="Ej. ropa cómoda o 2 pilas AA"/>
    <label className="compact-check"><input type="checkbox" checked={form.published} onChange={event => setForm({ ...form, published: event.target.checked })}/>Visible</label>
    <label className="compact-check"><input type="checkbox" checked={form.active} onChange={event => setForm({ ...form, active: event.target.checked })}/>Activa</label>
    <button onClick={async () => { await updateCommercialPractice(item.id, { duration_min: form.duration_min, published: form.published, active: form.active, requires_preparation: form.requires_preparation, preparation_instructions: form.requires_preparation ? form.preparation_instructions : null }); await onSaved(); }}>Guardar</button>
  </div>;
}

function ProfessionalRow({ professional, data, locations, locationIds, onSaved }: { professional: CommercialProfessional; data: CommercialAdminCatalog; locations: Location[]; locationIds: string[]; onSaved: () => Promise<void> }) {
  const [published, setPublished] = useState(professional.public_booking_enabled);
  const [specialties, setSpecialties] = useState(professional.specialty_ids);
  const [practices, setPractices] = useState(professional.practice_ids);
  const [assigned, setAssigned] = useState(locationIds);
  const toggle = (list: string[], id: string) => list.includes(id) ? list.filter(value => value !== id) : [...list, id];
  return <article><div><strong>{professional.full_name}</strong><label><input type="checkbox" checked={published} onChange={event => setPublished(event.target.checked)}/>Publicado</label></div><fieldset><legend>Especialidades</legend>{data.specialties.filter(item => item.active).map(item => <label key={item.id}><input type="checkbox" checked={specialties.includes(item.id)} onChange={() => setSpecialties(toggle(specialties, item.id))}/>{item.name}</label>)}</fieldset><fieldset><legend>Prácticas</legend>{data.practices.filter(item => item.active && specialties.includes(item.specialty_id)).map(item => <label key={item.id}><input type="checkbox" checked={practices.includes(item.id)} onChange={() => setPractices(toggle(practices, item.id))}/>{item.name}</label>)}</fieldset><fieldset><legend>Consultorios donde atiende</legend>{locations.filter(item => item.active).map(item => <label key={item.id}><input type="checkbox" checked={assigned.includes(item.id)} onChange={() => setAssigned(toggle(assigned, item.id))}/>{item.name}</label>)}</fieldset><button className="primary" onClick={async () => { await setProfessionalCommercialProfile({ professional_id: professional.id, published, specialty_ids: specialties, practice_ids: practices }); await setProfessionalLocations(professional.id, assigned); await onSaved(); }}>Guardar publicación</button></article>;
}
