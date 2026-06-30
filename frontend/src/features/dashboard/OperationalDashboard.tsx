import { useEffect, useMemo, useState } from "react";
import { DashboardFilters, DashboardMetric, DashboardReport, getDashboardReport, Profile } from "../../api/supabase";
import { Page } from "../../components/ui";

type Props = { profile: Profile; onAgenda: () => void; onNewPatient: () => void; onOpenPatient: (id: string) => void };

export function OperationalDashboard({ profile, onAgenda, onNewPatient, onOpenPatient }: Props) {
  const initial = useMemo(() => defaultRange(), []);
  const [filters, setFilters] = useState<DashboardFilters>(initial);
  const [report, setReport] = useState<DashboardReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false; setLoading(true); setError("");
    getDashboardReport(filters).then(value => { if (!cancelled) setReport(value); })
      .catch(err => { if (!cancelled) setError(err instanceof Error ? err.message : "No se pudo cargar el dashboard."); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [filters]);

  const title = profile.is_master || profile.role === "ADMINISTRADOR" ? "Dashboard general" : profile.role === "SECRETARIA" ? "Panel operativo" : "Mi actividad";
  const practices = report?.options.practices.filter(item => !filters.specialty_id || item.specialty_id === filters.specialty_id) || [];
  return <Page title={title} subtitle="Turnos, pacientes y ocupacion con datos reales" actions={<><button onClick={onAgenda}>Ver agenda</button><button className="primary" onClick={onNewPatient}>+ Nuevo paciente</button></>}>
    <section className="report-filters" aria-label="Filtros del dashboard">
      <label>Desde<input type="date" value={filters.from} onChange={e => setFilters({ ...filters, from:e.target.value })}/></label>
      <label>Hasta<input type="date" value={filters.to} onChange={e => setFilters({ ...filters, to:e.target.value })}/></label>
      {report && report.options.professionals.length>1 && <FilterSelect label="Profesional" value={filters.professional_id} items={report.options.professionals} onChange={value=>setFilters({...filters,professional_id:value})}/>} 
      {report && <FilterSelect label="Especialidad" value={filters.specialty_id} items={report.options.specialties} onChange={value=>setFilters({...filters,specialty_id:value,practice_id:""})}/>} 
      {report && <FilterSelect label="Practica" value={filters.practice_id} items={practices} onChange={value=>setFilters({...filters,practice_id:value})}/>} 
      {report && report.options.locations.length>1 && <FilterSelect label="Consultorio" value={filters.location_id} items={report.options.locations} onChange={value=>setFilters({...filters,location_id:value})}/>} 
      <FilterSelect label="Estado" value={filters.status} items={[{id:"PENDIENTE",name:"Pendiente"},{id:"CONFIRMADO",name:"Confirmado"},{id:"ATENDIDO",name:"Atendido"},{id:"CANCELADO",name:"Cancelado"},{id:"AUSENTE",name:"Ausente"}]} onChange={value=>setFilters({...filters,status:value})}/>
      <FilterSelect label="Origen" value={filters.source} items={[{id:"INTERNAL",name:"Interno"},{id:"WEB",name:"Web"}]} onChange={value=>setFilters({...filters,source:value})}/>
      <FilterSelect label="Validacion" value={filters.validation_status} items={[{id:"PENDIENTE",name:"Pendiente"},{id:"VALIDADO",name:"Validado"},{id:"ARCHIVADO_NO_VALIDADO",name:"Archivado"}]} onChange={value=>setFilters({...filters,validation_status:value})}/>
      <button type="button" onClick={()=>setFilters(initial)}>Limpiar</button>
    </section>
    {error && <p className="error">{error}</p>}{loading && <p className="notice">Actualizando indicadores...</p>}
    {report && <>
      <section className="report-kpis">
        <Kpi label="Turnos" value={report.summary.total}/><Kpi label="Pendientes" value={report.summary.pending} tone="warning"/><Kpi label="Confirmados" value={report.summary.confirmed}/><Kpi label="Atendidos" value={report.summary.attended} tone="success"/><Kpi label="Cancelados" value={report.summary.cancelled} tone="danger"/><Kpi label="Ocupacion" value={`${report.summary.occupancy}%`}/><Kpi label="Pacientes nuevos" value={report.summary.newPatients}/><Kpi label="Pendientes de validar" value={report.summary.pendingValidation} tone="warning"/>
      </section>
      <section className="report-grid">
        <MetricPanel title="Por profesional" items={report.byProfessional}/><MetricPanel title="Practicas mas solicitadas" items={report.byPractice}/><MetricPanel title="Por especialidad" items={report.bySpecialty}/><MetricPanel title="Por consultorio" items={report.byLocation}/><MetricPanel title="Horarios mas demandados" items={report.byHour}/>
        <div className="panel report-origin"><h2>Origen</h2><div><strong>{report.summary.internalAppointments}</strong><span>Internos</span></div><div><strong>{report.summary.webAppointments}</strong><span>Web</span></div><small>{report.summary.webPatients} pacientes nuevos desde turnera · {report.summary.archivedValidation} archivados sin validar</small></div>
      </section>
      <section className="panel report-table-panel"><div className="section-title"><div><h2>Turnos del periodo</h2><p>Hasta 500 filas, respetando tus permisos.</p></div><button onClick={()=>exportAppointmentsCsv(report)}>Exportar CSV</button></div>
        <div className="report-table-wrap"><table><thead><tr><th>Fecha</th><th>Paciente</th><th>Profesional</th><th>Consultorio</th><th>Estado</th><th>Origen</th></tr></thead><tbody>{report.appointments.map(item=><tr key={item.id}><td>{formatDate(item.starts_at)}</td><td>{item.patient_last_name}, {item.patient_first_name}</td><td>{item.professional_name}</td><td>{item.location_name}</td><td>{item.status}</td><td>{item.source==="WEB"?"Web":"Interno"}</td></tr>)}</tbody></table>{!report.appointments.length&&<p className="empty-day">No hay turnos para estos filtros.</p>}</div>
      </section>
      {!!report.patients.length && <section className="panel report-patients"><h2>Pacientes recientes</h2>{report.patients.slice(0,8).map(patient=><button key={patient.id} onClick={()=>onOpenPatient(patient.id)}><span>{patient.last_name}, {patient.first_name}</span><small>{patient.source==="WEB"?"Turnera web":"Carga interna"} · {patient.validation_status.replace(/_/g," ")}</small></button>)}</section>}
    </>}
  </Page>;
}

function FilterSelect({label,value,items,onChange}:{label:string;value?:string;items:Array<{id:string;name:string}>;onChange:(value:string)=>void}) { return <label>{label}<select value={value||""} onChange={e=>onChange(e.target.value)}><option value="">Todos</option>{items.map(item=><option key={item.id} value={item.id}>{item.name}</option>)}</select></label>; }
function Kpi({label,value,tone=""}:{label:string;value:number|string;tone?:string}) { return <article className={tone}><span>{label}</span><strong>{value}</strong></article>; }
function MetricPanel({title,items}:{title:string;items:DashboardMetric[]}) { const max=Math.max(1,...items.map(i=>i.value)); return <div className="panel metric-panel"><h2>{title}</h2>{items.slice(0,7).map(item=><div key={item.label}><span>{item.label}</span><i><b style={{width:`${Math.max(4,item.value/max*100)}%`}}/></i><strong>{item.value}</strong></div>)}{!items.length&&<p className="empty-day">Sin datos en el periodo.</p>}</div>; }
function defaultRange():DashboardFilters { const now=new Date(); const fromDate=new Date(now); const toDate=new Date(now); fromDate.setDate(fromDate.getDate()-30); toDate.setDate(toDate.getDate()+30); return {from:localDate(fromDate),to:localDate(toDate)}; }
function localDate(date:Date) { return new Intl.DateTimeFormat("en-CA",{timeZone:"America/Argentina/Buenos_Aires"}).format(date); }
function formatDate(value:string) { return new Date(value).toLocaleString("es-AR",{timeZone:"America/Argentina/Buenos_Aires",day:"2-digit",month:"2-digit",year:"numeric",hour:"2-digit",minute:"2-digit"}); }
function exportAppointmentsCsv(report:DashboardReport) { const rows=[["Fecha","Paciente","Profesional","Consultorio","Estado","Origen"],...report.appointments.map(i=>[formatDate(i.starts_at),`${i.patient_last_name}, ${i.patient_first_name}`,i.professional_name,i.location_name,i.status,i.source])]; const csv=rows.map(row=>row.map(value=>`"${String(value).replace(/"/g,'""')}"`).join(";")).join("\r\n"); const link=document.createElement("a");link.href=URL.createObjectURL(new Blob(["\ufeff",csv],{type:"text/csv;charset=utf-8"}));link.download=`turnos_${Date.now()}.csv`;link.click();URL.revokeObjectURL(link.href); }
