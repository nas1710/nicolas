import React, { useEffect, useState } from "react";
import { getOrganizationSettings, getPublicCommercialCatalog, OrganizationSettings, organizationLogoUrl, PublicCommercialCatalog } from "../api/supabase";

const emptyCatalog: PublicCommercialCatalog = { specialties: [], practices: [], professionals: [], locations: [] };

export function PublicHomePage() {
  const [catalog,setCatalog]=useState(emptyCatalog); const [organization,setOrganization]=useState<OrganizationSettings|null>(null);
  const [loading,setLoading]=useState(true); const [error,setError]=useState("");
  useEffect(()=>{Promise.all([getPublicCommercialCatalog(),getOrganizationSettings()]).then(([nextCatalog,nextOrganization])=>{setCatalog(nextCatalog);setOrganization(nextOrganization);}).catch(err=>setError(err instanceof Error?err.message:"No se pudo cargar la informacion.")).finally(()=>setLoading(false));},[]);
  const name=organization?.commercial_name||"Atencion medica"; const logo=organizationLogoUrl(organization?.logo_path);
  return <div className="public-home" style={{"--brand-primary":organization?.primary_color||"#176f78","--brand-secondary":organization?.secondary_color||"#dff4ee"} as React.CSSProperties}>
    <header className="public-home-nav"><a className="public-home-brand" href="/">{logo?<img src={logo} alt={name}/>:<span>SP</span>}<strong>{name}</strong></a><a className="public-home-login" href="/login">Acceso interno</a></header>
    <main>
      <section className="public-home-hero"><div className="public-home-hero-copy"><p>{organization?.description||"Consultorios y profesionales de la salud"}</p><h1>{organization?.welcome_title||name}</h1><span>{organization?.welcome_text||"Consulta especialidades, profesionales y horarios reales desde un mismo lugar."}</span><a className="public-home-cta" href="/turnos">Solicitar turno</a></div></section>
      {organization?.public_notice&&<aside className="public-home-notice">{organization.public_notice}</aside>}
      {error&&<p className="public-home-error">{error}</p>}
      <section className="public-home-band"><div className="public-home-section-head"><span>Especialidades</span><h2>Areas de atencion</h2></div><div className="public-home-grid">{catalog.specialties.map(item=><article key={item.id}><strong>{item.name}</strong><p>{item.description||"Atencion profesional con agenda disponible."}</p><a href={`/turnos?especialidad=${item.id}`}>Ver turnos</a></article>)}{!loading&&!catalog.specialties.length&&<p>Las especialidades se estan configurando.</p>}</div></section>
      <section className="public-home-band muted"><div className="public-home-section-head"><span>Profesionales</span><h2>Equipo publicado</h2></div><div className="public-professional-list">{catalog.professionals.map(item=><article key={item.id}><span>{item.full_name.slice(0,2).toUpperCase()}</span><div><strong>{item.full_name}</strong><small>{item.specialty}</small></div></article>)}</div></section>
      <section className="public-home-band"><div className="public-home-section-head"><span>Practicas</span><h2>Prestaciones disponibles</h2></div><div className="public-practice-list">{catalog.practices.map(item=><span key={item.id}>{item.name}<small>{item.duration_min} min</small></span>)}</div></section>
      <section className="public-home-locations"><div><span>Centros de atencion</span><h2>Consultorios activos</h2></div>{catalog.locations.map(item=><article key={item.id}><strong>{item.name}</strong><p>{item.address||"Direccion a confirmar al reservar."}</p></article>)}</section>
      {!!organization?.insurance_plans?.length&&<section className="public-home-band muted"><div className="public-home-section-head"><span>Convenios</span><h2>Obras sociales</h2></div><div className="public-practice-list">{organization.insurance_plans.map(item=><span key={item.id}>{item.name}</span>)}</div>{organization.insurance_information&&<p>{organization.insurance_information}</p>}</section>}
    </main>
    <footer className="public-home-footer"><span>{name}{organization?.phone?` · ${organization.phone}`:""}{organization?.email?` · ${organization.email}`:""}</span><a href="/login">Acceso interno</a></footer>
  </div>;
}
