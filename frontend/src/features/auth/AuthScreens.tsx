import React, { useState } from "react";
import {
  formatProperName,
  getCurrentProfile,
  getRememberSessionPreference,
  Profile,
  requestPasswordReset,
  requestUserAccess,
  resendConfirmationEmail,
  signIn,
  updateCurrentPassword
} from "../../api/supabase";

export function Login({ initialError = "", onLogin }: { initialError?: string; onLogin: (profile: Profile) => void }) {
  const [mode, setMode] = useState<"login" | "request" | "reset">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [error, setError] = useState(initialError);
  const [message, setMessage] = useState("");
  const [resending, setResending] = useState(false);
  const [remember, setRemember] = useState(getRememberSessionPreference());
  const needsEmailConfirmation = error.includes("confirma tu email");

  async function resendConfirmation() {
    if (!email.trim()) return setError("Escribi tu email para reenviar la activacion.");
    setResending(true);
    setMessage("");
    try {
      await resendConfirmationEmail(email);
      setError("");
      setMessage("Listo. Te reenviamos el correo de activacion.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo reenviar el correo.");
    } finally {
      setResending(false);
    }
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError("");
    setMessage("");
    try {
      if (mode === "request") {
        if (!fullName.trim() || !email.trim() || !password.trim()) throw new Error("Nombre, email y contrasena son obligatorios.");
        await requestUserAccess({ full_name: fullName, email, password });
        setMessage("Solicitud enviada. La medica/admin debe habilitar el usuario desde Usuarios.");
        return;
      }
      if (mode === "reset") {
        if (!email.trim()) throw new Error("Escribi tu email.");
        await requestPasswordReset(email);
        setMessage("Te enviamos un email para recuperar la contrasena.");
        return;
      }
      const profile = await signIn(email, password, remember);
      if (!profile) throw new Error("El usuario no tiene perfil configurado.");
      onLogin(profile);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error de login");
    }
  }

  return (
    <div className="login">
      <form onSubmit={submit} className="panel login-panel">
        <div className="login-brand">
          <span>SP</span>
          <div><h1>Acceso al consultorio</h1><p>Pacientes y agenda</p></div>
        </div>
        {mode !== "login" && <button type="button" className="link login-back" onClick={() => setMode("login")}>Volver al ingreso</button>}
        {mode === "request" && <label>Nombre completo<input value={fullName} onChange={event => setFullName(event.target.value)} onBlur={() => setFullName(formatProperName(fullName))} /></label>}
        <label>Email<input value={email} onChange={event => setEmail(event.target.value)} /></label>
        {mode !== "reset" && <label>Contrasena<input type="password" value={password} onChange={event => setPassword(event.target.value)} /></label>}
        {needsEmailConfirmation ? (
          <div className="auth-alert" role="status">
            <span className="auth-alert-mark" aria-hidden="true">!</span>
            <div>
              <strong>Activa tu cuenta</strong>
              <p>Revisa tu correo y abri el enlace que te enviamos para poder ingresar.</p>
              <button type="button" className="link" disabled={resending} onClick={() => void resendConfirmation()}>
                {resending ? "Reenviando..." : "Reenviar correo"}
              </button>
            </div>
          </div>
        ) : error ? <p className="error login-error">{error}</p> : null}
        {message && <p className="notice ok-notice">{message}</p>}
        {mode === "login" && <label className="remember-session"><input type="checkbox" checked={remember} onChange={event => setRemember(event.target.checked)} />Recordarme en este dispositivo</label>}
        <button className="primary">{mode === "login" ? "Ingresar" : mode === "request" ? "Solicitar acceso" : "Enviar recuperacion"}</button>
        {mode === "login" && (
          <div className="login-secondary-actions">
            <button type="button" className="link" onClick={() => setMode("reset")}>Olvide mi contrasena</button>
            <button type="button" className="link" onClick={() => setMode("request")}>Solicitar nuevo usuario</button>
          </div>
        )}
      </form>
    </div>
  );
}

export function PasswordRecovery({ forced = false, onDone }: { forced?: boolean; onDone: (profile: Profile) => void }) {
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (password.length < 8) return setError("La nueva contrasena debe tener al menos 8 caracteres.");
    if (password !== confirmation) return setError("Las contrasenas no coinciden.");
    setSaving(true);
    setError("");
    try {
      await updateCurrentPassword(password);
      const profile = await getCurrentProfile();
      if (!profile) throw new Error("No se pudo recuperar el perfil del usuario.");
      onDone(profile);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo cambiar la contrasena.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="login">
      <form onSubmit={submit} className="panel login-panel">
        <div className="login-brand">
          <span>SP</span>
          <div><h1>{forced ? "Cambia tu clave provisoria" : "Nueva contrasena"}</h1><p>Elegi una clave personal para tu cuenta</p></div>
        </div>
        <label>Nueva contrasena<input type="password" value={password} onChange={event => setPassword(event.target.value)} autoComplete="new-password" /></label>
        <label>Repetir contrasena<input type="password" value={confirmation} onChange={event => setConfirmation(event.target.value)} autoComplete="new-password" /></label>
        <small className="password-hint">Usa al menos 8 caracteres. Evita nombres, DNI o claves compartidas.</small>
        {error && <p className="error login-error">{error}</p>}
        <button className="primary" disabled={saving}>{saving ? "Guardando..." : "Guardar nueva contrasena"}</button>
      </form>
    </div>
  );
}
