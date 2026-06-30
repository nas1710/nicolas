import React, { useEffect, useState } from "react";
import {
  createUserWithLogin,
  formatDocumentNumber,
  formatProperName,
  Location,
  normalizeDocumentNumber,
  Profile,
  ProfileInput,
  resetUserPasswordToDocument,
  setProfileActive,
  updateProfile
} from "../../api/supabase";

export function UserManager({ users, locations, onSaved }: { users: Profile[]; locations: Location[]; onSaved: () => Promise<void> }) {
  const [form, setForm] = useState({ email: "", password: "", full_name: "", role: "SECRETARIA" as ProfileInput["role"], location_id: "", document_number: "" });
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);
  const [statusFilter, setStatusFilter] = useState<"activos" | "inactivos" | "todos">("activos");
  const visibleUsers = users.filter(user => statusFilter === "todos" || (statusFilter === "activos" ? user.active : !user.active));

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!form.email.trim() || !form.password.trim() || !form.full_name.trim()) return setError("Email, contrasena y nombre son obligatorios.");
    if (form.document_number.replace(/\D/g, "").length < 6) return setError("Carga el DNI del usuario para poder blanquear su acceso.");
    if (form.password.length < 8) return setError("La contrasena debe tener al menos 8 caracteres.");
    if (form.role === "SECRETARIA" && !form.location_id) return setError("La secretaria debe tener un consultorio.");
    setError("");
    setMessage("");
    setSaving(true);
    try {
      const created = await createUserWithLogin(form);
      setForm({ email: "", password: "", full_name: "", role: "SECRETARIA", location_id: "", document_number: "" });
      await onSaved();
      setMessage(`${created.full_name} fue dada de alta. Ya puede ingresar; si recibe un email de confirmacion, debe abrirlo primero.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo crear el usuario.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="panel admin-section wide user-manager">
      <div className="section-title"><div><h2>Usuarios</h2><p>{users.filter(user => user.active).length} activos · {users.length} totales</p></div></div>
      <details className="user-create-panel">
        <summary>+ Nuevo usuario</summary>
        <div className="user-create-content">
          <p className="notice">El DNI se usa como clave provisoria al blanquear el acceso. En el siguiente ingreso debe elegir una contrasena personal.</p>
          <form className="form-grid" onSubmit={submit}>
            <label>Email<input value={form.email} onChange={event => setForm({ ...form, email: event.target.value })} /></label>
            <label>Contrasena inicial<input type="password" value={form.password} onChange={event => setForm({ ...form, password: event.target.value })} /></label>
            <label>Nombre<input value={form.full_name} onChange={event => setForm({ ...form, full_name: event.target.value })} onBlur={() => setForm(current => ({ ...current, full_name: formatProperName(current.full_name) }))} /></label>
            <label>DNI del usuario<input value={formatDocumentNumber("DNI", form.document_number, "")} onChange={event => setForm({ ...form, document_number: normalizeDocumentNumber("DNI", event.target.value) })} inputMode="numeric" /></label>
            <label>Rol
              <select value={form.role} onChange={event => setForm({ ...form, role: event.target.value as ProfileInput["role"], location_id: event.target.value === "SECRETARIA" ? form.location_id : "" })}>
                <option value="SECRETARIA">Secretaria</option>
                <option value="MEDICA_ADMIN">Medica/Admin</option>
              </select>
            </label>
            <label>Consultorio
              <select value={form.location_id || ""} onChange={event => setForm({ ...form, location_id: event.target.value })} disabled={form.role === "MEDICA_ADMIN"}>
                <option value="">Elegir consultorio</option>
                {locations.map(location => <option key={location.id} value={location.id}>{location.name}</option>)}
              </select>
            </label>
            {error && <p className="error">{error}</p>}
            {message && <p className="notice ok-notice">{message}</p>}
            <div className="form-actions"><button className="primary" disabled={saving}>{saving ? "Creando..." : "Crear usuario"}</button></div>
          </form>
        </div>
      </details>
      <div className="user-list-toolbar">
        <strong>Accesos</strong>
        <div className="segmented status-filter" aria-label="Filtrar usuarios">
          <button className={statusFilter === "activos" ? "active" : ""} onClick={() => setStatusFilter("activos")}>Activos</button>
          <button className={statusFilter === "inactivos" ? "active" : ""} onClick={() => setStatusFilter("inactivos")}>Inactivos</button>
          <button className={statusFilter === "todos" ? "active" : ""} onClick={() => setStatusFilter("todos")}>Todos</button>
        </div>
      </div>
      <div className="list user-list">
        {visibleUsers.map(user => <UserRow key={user.id} user={user} locations={locations} onSaved={onSaved} />)}
        {visibleUsers.length === 0 && <p className="empty-day">No hay usuarios en esta vista.</p>}
      </div>
    </section>
  );
}

function UserRow({ user, locations, onSaved }: { user: Profile; locations: Location[]; onSaved: () => Promise<void> }) {
  const [form, setForm] = useState<Omit<ProfileInput, "id">>({
    email: user.email,
    full_name: user.full_name,
    role: user.role,
    location_id: user.location_id || "",
    active: user.active,
    document_number: user.document_number || ""
  });
  const [resetStatus, setResetStatus] = useState("");
  const [editing, setEditing] = useState(false);
  const [changingStatus, setChangingStatus] = useState(false);

  useEffect(() => {
    setForm({
      email: user.email,
      full_name: user.full_name,
      role: user.role,
      location_id: user.location_id || "",
      active: user.active,
      document_number: user.document_number || ""
    });
  }, [user]);

  async function resetPassword() {
    if (!window.confirm(`Blanquear la clave de ${user.full_name} usando su DNI como clave provisoria?`)) return;
    setResetStatus("Blanqueando...");
    try {
      const result = await resetUserPasswordToDocument(user.id);
      setResetStatus(`Clave provisoria: ${result.temporary_password}. Debe cambiarla al ingresar.`);
    } catch (err) {
      setResetStatus(err instanceof Error ? err.message : "No se pudo blanquear");
    }
  }

  async function saveUser(next = form) {
    setResetStatus("");
    try {
      await updateProfile(user.id, next);
      await onSaved();
      setEditing(false);
    } catch (err) {
      setResetStatus(err instanceof Error ? err.message : "No se pudo actualizar el usuario.");
    }
  }

  async function toggleActive() {
    if (user.is_master) return;
    const action = user.active ? "bloquear" : "reactivar";
    if (!window.confirm(`${action === "bloquear" ? "Bloquear" : "Reactivar"} el acceso de ${user.full_name}?`)) return;
    setChangingStatus(true);
    setResetStatus("");
    try {
      await setProfileActive(user.id, !user.active);
      await onSaved();
    } catch (err) {
      setResetStatus(err instanceof Error ? err.message : "No se pudo cambiar el estado del usuario.");
    } finally {
      setChangingStatus(false);
    }
  }

  if (!editing) {
    return (
      <article className={`user-card ${user.active ? "" : "is-inactive"}`}>
        <div className="user-card-identity">
          <span className="avatar">{user.full_name?.slice(0, 2).toUpperCase() || "US"}</span>
          <div><strong>{user.full_name}</strong><small>{user.email}</small></div>
        </div>
        <div className="user-card-meta">
          <span>{user.role === "MEDICA_ADMIN" ? "Medica/Admin" : "Secretaria"}</span>
          <span>{user.location?.name || "Todos los consultorios"}</span>
          {user.document_number && <span>DNI {formatDocumentNumber("DNI", user.document_number, "")}</span>}
        </div>
        <div className="user-card-actions">
          {user.is_master ? <span className="badge master">Maestro</span> : (
            <label className="status-switch">
              <input type="checkbox" checked={user.active} disabled={changingStatus} onChange={() => void toggleActive()} />
              <span>{changingStatus ? "Guardando..." : user.active ? "Activo" : "Bloqueado"}</span>
            </label>
          )}
          {!user.is_master && <button type="button" className="secondary-action" onClick={() => setEditing(true)}>Editar</button>}
        </div>
        {resetStatus && <small className="user-reset-status">{resetStatus}</small>}
      </article>
    );
  }

  return (
    <article className="user-card user-card-editing">
      <div className="user-edit-grid">
        <label>Nombre<input value={form.full_name} onChange={event => setForm({ ...form, full_name: event.target.value })} onBlur={() => setForm(current => ({ ...current, full_name: formatProperName(current.full_name) }))} /></label>
        <label>Email<input value={form.email} onChange={event => setForm({ ...form, email: event.target.value })} /></label>
        <label>DNI<input value={formatDocumentNumber("DNI", form.document_number, "")} onChange={event => setForm({ ...form, document_number: normalizeDocumentNumber("DNI", event.target.value) })} inputMode="numeric" /></label>
        <label>Rol<select value={form.role} onChange={event => setForm({ ...form, role: event.target.value as ProfileInput["role"], location_id: event.target.value === "SECRETARIA" ? form.location_id : "" })}>
          <option value="SECRETARIA">Secretaria</option><option value="MEDICA_ADMIN">Medica/Admin</option>
        </select></label>
        <label>Consultorio<select value={form.location_id || ""} onChange={event => setForm({ ...form, location_id: event.target.value })} disabled={form.role === "MEDICA_ADMIN"}>
          <option value="">Todos</option>{locations.map(location => <option key={location.id} value={location.id}>{location.name}</option>)}
        </select></label>
      </div>
      <div className="row-actions user-edit-actions">
        <button className="primary" onClick={() => void saveUser()}>Guardar cambios</button>
        <button type="button" onClick={() => { setEditing(false); setResetStatus(""); }}>Cancelar</button>
        <button type="button" onClick={() => void resetPassword()}>Blanquear clave</button>
      </div>
      {resetStatus && <small className="user-reset-status">{resetStatus}</small>}
    </article>
  );
}
