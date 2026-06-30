import React, { useEffect, useState } from "react";
import { getPublicCommercialCatalog, PublicCommercialCatalog } from "../api/supabase";

const emptyCatalog: PublicCommercialCatalog = { specialties: [], practices: [], professionals: [], locations: [] };

export function PublicHomePage() {
  const [catalog, setCatalog] = useState(emptyCatalog);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  useEffect(() => { getPublicCommercialCatalog().then(setCatalog).catch(err => setError(err instanceof Error ? err.message : "No se pudo cargar la informacion.")).finally(() => setLoading(false)); }, []);
  return <div className="public-home">
    <header className="public-home-nav"><a className="public-home-brand" href="/"><span>SP</span><strong>Atencion medica</strong></a><a className="public-home-login" href="/login">Acceso interno</a></header>
    <main>
      <section className="public-home-hero">
        <div className="public-home-hero-copy"><p>Consultorios y profesionales de la salud</p><h1>Atencion medica</h1><span>Consulta especialidades, profesionales y horarios reales desde un mismo lugar.</span><a className="public-home-cta" href="/turnos">Solicitar turno</a></div>
      </section>
      {error && <p className="public-home-error">{error}</p>}
      <section className="public-home-band"><div className="public-home-section-head"><span>Especialidades</span><h2>Áreas de atención</h2></div><div className="public-home-grid">{catalog.specialties.map(item => <article key={item.id}><strong>{item.name}</strong><p>{item.description || "Atencion profesional con agenda disponible."}</p><a href={`/turnos?especialidad=${item.id}`}>Ver turnos</a></article>)}{!loading && !catalog.specialties.length && <p>Las especialidades se están configurando.</p>}</div></section>
      <section className="public-home-band muted"><div className="public-home-section-head"><span>Profesionales</span><h2>Equipo publicado</h2></div><div className="public-professional-list">{catalog.professionals.map(item => <article key={item.id}><span>{item.full_name.slice(0,2).toUpperCase()}</span><div><strong>{item.full_name}</strong><small>{item.specialty}</small></div></article>)}</div></section>
      <section className="public-home-band"><div className="public-home-section-head"><span>Prácticas</span><h2>Prestaciones disponibles</h2></div><div className="public-practice-list">{catalog.practices.map(item => <span key={item.id}>{item.name}<small>{item.duration_min} min</small></span>)}</div></section>
      <section className="public-home-locations"><div><span>Centros de atención</span><h2>Consultorios activos</h2></div>{catalog.locations.map(item => <article key={item.id}><strong>{item.name}</strong><p>{item.address || "Direccion a confirmar al reservar."}</p></article>)}</section>
    </main>
    <footer className="public-home-footer"><span>Gestión asistencial</span><a href="/login">Acceso interno</a></footer>
  </div>;
}
