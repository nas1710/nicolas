import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

Deno.serve(async request => {
  const configuredOrigins = (Deno.env.get("CORS_ORIGIN") || "https://cardioayala.vercel.app,http://localhost:5173,http://127.0.0.1:5174")
    .split(",")
    .map(value => value.trim());
  const requestOrigin = request.headers.get("Origin") || "";
  const corsHeaders = {
    "Access-Control-Allow-Origin": configuredOrigins.includes(requestOrigin) ? requestOrigin : configuredOrigins[0],
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin"
  };

  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!supabaseUrl || !anonKey || !serviceRoleKey) throw new Error("Faltan variables seguras de Supabase.");

    const authHeader = request.headers.get("Authorization") || "";
    const userClient = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authHeader } } });
    const adminClient = createClient(supabaseUrl, serviceRoleKey);
    const { data: authData, error: authError } = await userClient.auth.getUser();
    if (authError || !authData.user) throw new Error("Sesion invalida.");

    const { data: requester } = await adminClient.from("profiles").select("id, role, active, is_master").eq("id", authData.user.id).single();
    if (!requester?.active || requester.role !== "MEDICA_ADMIN") throw new Error("Solo una medica/admin puede administrar accesos.");

    const body = await request.json();

    if (body.action === "create_user") {
      const email = String(body.email || "").trim().toLowerCase();
      const password = String(body.password || "");
      const fullName = String(body.full_name || "").trim();
      const role = body.role === "MEDICA_ADMIN" ? "MEDICA_ADMIN" : "SECRETARIA";
      const locationId = role === "SECRETARIA" ? String(body.location_id || "") || null : null;
      const documentNumber = String(body.document_number || "").replace(/\D/g, "");
      if (!email.includes("@")) throw new Error("Ingresa un email valido.");
      if (password.length < 8) throw new Error("La contrasena inicial debe tener al menos 8 caracteres.");
      if (!fullName) throw new Error("Ingresa el nombre del usuario.");
      if (documentNumber.length < 6) throw new Error("Ingresa el DNI del usuario.");
      if (role === "SECRETARIA" && !locationId) throw new Error("Asigna un consultorio a la secretaria.");

      const { data: created, error: createError } = await adminClient.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { full_name: fullName }
      });
      if (createError) throw createError;

      const { data: profile, error: profileError } = await adminClient
        .from("profiles")
        .upsert({
          id: created.user.id,
          email,
          full_name: fullName,
          role,
          location_id: locationId,
          active: true,
          document_number: documentNumber,
          must_change_password: false,
          is_master: false
        })
        .select("*, location:locations(*)")
        .single();
      if (profileError) {
        await adminClient.auth.admin.deleteUser(created.user.id);
        throw profileError;
      }

      return new Response(JSON.stringify({ profile }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    if (body.action !== "reset_password") throw new Error("Accion no valida.");

    const targetId = String(body.user_id || "");
    const { data: target, error: targetError } = await adminClient
      .from("profiles")
      .select("id, full_name, document_number, is_master")
      .eq("id", targetId)
      .single();
    if (targetError || !target) throw new Error("Usuario no encontrado.");
    if (target.is_master && requester.id !== target.id) throw new Error("El acceso del usuario maestro esta protegido.");

    const temporaryPassword = String(target.document_number || "").replace(/\D/g, "");
    if (temporaryPassword.length < 6) throw new Error("Carga el DNI del usuario antes de blanquear su contrasena.");

    const { error: updateAuthError } = await adminClient.auth.admin.updateUserById(target.id, { password: temporaryPassword });
    if (updateAuthError) throw updateAuthError;

    const { error: updateProfileError } = await adminClient
      .from("profiles")
      .update({ must_change_password: true })
      .eq("id", target.id);
    if (updateProfileError) throw updateProfileError;

    return new Response(JSON.stringify({ temporary_password: temporaryPassword }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : "No se pudo administrar el usuario." }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  }
});
