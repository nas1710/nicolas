import { useEffect, useState } from "react";
import { getOrganizationSettings, listOrganizationCenters, OrganizationCenter, OrganizationSettings, organizationLogoUrl, saveOrganizationCenter, updateOrganizationSettings, uploadOrganizationLogo } from "../../api/supabase";

export function OrganizationSettingsManager() {
  const [form,setForm]=useState<OrganizationSettings|null>(null); const [status,setStatus]=useState(""); const [saving,setSaving]=useState(false);
  const [centers,setCenters]=useState<OrganizationCenter[]>([]); const [newCenter,setNewCenter]=useState({name:"",address:""});
  useEffect(()=>{getOrganizationSettings().then(setForm).catch(e=>setStatus(e instanceof Error?e.message:"No se pudo cargar la organizacion."));listOrganizationCenters().then(setCenters).catch(()=>setCenters([]));},[]);
  if(!form)return <section className="panel admin-section wide"><h2>Organizacion y marca</h2><p>{status||"Cargando..."}</p></section>;
  const field=(key:keyof OrganizationSettings,value:string)=>setForm({...form,[key]:value});
  async function save(){if(!form)return;setSaving(true);setStatus("");try{setForm(await updateOrganizationSettings(form));setStatus("Configuracion institucional guardada.");}catch(e){setStatus(e instanceof Error?e.message:"No se pudo guardar.");}finally{setSaving(false);}}
  async function logo(file?:File){if(!file)return;setStatus("");try{const path=await uploadOrganizationLogo(file,form!.id);setForm({...form!,logo_path:path});setStatus("Logo actualizado.");}catch(e){setStatus(e instanceof Error?e.message:"No se pudo cargar el logo.");}}
  return <section className="panel admin-section wide organization-settings">
    <div className="section-title"><div><h2>Organizacion y marca</h2><p>Identidad publica, contacto, turnera y documentos.</p></div>{form.logo_path&&<img src={organizationLogoUrl(form.logo_path)} alt="Logo actual" />}</div>
    <div className="form-grid">
      <label>Nombre comercial<input value={form.commercial_name||""} onChange={e=>field("commercial_name",e.target.value)}/></label>
      <label>Razon social<input value={form.legal_name||""} onChange={e=>field("legal_name",e.target.value)}/></label>
      <label>CUIT / identificador<input value={form.tax_id||""} onChange={e=>field("tax_id",e.target.value)}/></label>
      <label>Email<input value={form.email||""} onChange={e=>field("email",e.target.value)}/></label>
      <label>Telefono<input value={form.phone||""} onChange={e=>field("phone",e.target.value)}/></label>
      <label>WhatsApp<input value={form.whatsapp||""} onChange={e=>field("whatsapp",e.target.value)}/></label>
      <label className="full-field">Direccion principal<input value={form.main_address||""} onChange={e=>field("main_address",e.target.value)}/></label>
      <label className="full-field">Descripcion<textarea value={form.description||""} onChange={e=>field("description",e.target.value)}/></label>
      <label>Titulo de bienvenida<input value={form.welcome_title||""} onChange={e=>field("welcome_title",e.target.value)}/></label>
      <label className="full-field">Texto de bienvenida<textarea value={form.welcome_text||""} onChange={e=>field("welcome_text",e.target.value)}/></label>
      <label className="full-field">Condiciones para solicitar turnos<textarea value={form.booking_terms||""} onChange={e=>field("booking_terms",e.target.value)}/></label>
      <label className="full-field">Obras sociales / convenios<textarea value={form.insurance_information||""} onChange={e=>field("insurance_information",e.target.value)}/></label>
      <label className="full-field">Aviso publico<textarea value={form.public_notice||""} onChange={e=>field("public_notice",e.target.value)}/></label>
      <label className="full-field">Pie legal / institucional<textarea value={form.legal_text||""} onChange={e=>field("legal_text",e.target.value)}/></label>
      <label>Color principal<input type="color" value={form.primary_color||"#176f78"} onChange={e=>field("primary_color",e.target.value)}/></label>
      <label>Color secundario<input type="color" value={form.secondary_color||"#dff4ee"} onChange={e=>field("secondary_color",e.target.value)}/></label>
      <label>Logo institucional<input type="file" accept="image/jpeg,image/png,image/webp" onChange={e=>void logo(e.target.files?.[0])}/><small>JPG, PNG o WEBP. Maximo 2 MB.</small></label>
    </div>
    {status&&<p className={status.includes("guardada")||status.includes("actualizado")?"notice ok-notice":"error"}>{status}</p>}
    <div className="form-actions"><button className="primary" disabled={saving} onClick={()=>void save()}>{saving?"Guardando...":"Guardar organizacion"}</button></div>
    <details><summary>Sedes o centros ({centers.length})</summary><div className="commercial-rows">
      <form className="mini-form" onSubmit={async e=>{e.preventDefault();if(!newCenter.name.trim())return;await saveOrganizationCenter({...newCenter,name:newCenter.name,active:true,published:true});setNewCenter({name:"",address:""});setCenters(await listOrganizationCenters());}}><input placeholder="Nombre de sede" value={newCenter.name} onChange={e=>setNewCenter({...newCenter,name:e.target.value})}/><input placeholder="Direccion" value={newCenter.address} onChange={e=>setNewCenter({...newCenter,address:e.target.value})}/><button className="primary">Agregar sede</button></form>
      {centers.map(center=><CenterRow key={center.id} center={center} onSaved={async()=>setCenters(await listOrganizationCenters())}/>)}</div></details>
  </section>;
}

function CenterRow({center,onSaved}:{center:OrganizationCenter;onSaved:()=>Promise<void>}){const [form,setForm]=useState(center);return <div className="editable-row"><input value={form.name} onChange={e=>setForm({...form,name:e.target.value})}/><input value={form.address||""} placeholder="Direccion" onChange={e=>setForm({...form,address:e.target.value})}/><label><input type="checkbox" checked={form.published} onChange={e=>setForm({...form,published:e.target.checked})}/>Publica</label><label><input type="checkbox" checked={form.active} onChange={e=>setForm({...form,active:e.target.checked})}/>Activa</label><button onClick={async()=>{await saveOrganizationCenter(form);await onSaved();}}>Guardar</button></div>}
