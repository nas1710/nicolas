import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

type ManagedRole = "ADMINISTRADOR" | "MEDICA_ADMIN" | "MEDICO" | "SECRETARIA";

function managedRole(value: unknown): ManagedRole {
  if (value === "ADMINISTRADOR") return "ADMINISTRADOR";
  if (value === "MEDICA_ADMIN") return "MEDICA_ADMIN";
  if (value === "MEDICO") return "MEDICO";
  return "SECRETARIA";
}

function text(value: unknown) {
  return String(value ?? "").trim();
}

function normalizedDocument(value: unknown) {
  return text(value).replace(/\D/g, "");
}

function json(body: unknown, headers: Record<string, string>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...headers, "Content-Type": "application/json" }
  });
}

function safeErrorMessage(error: unknown) {
  const message = error instanceof Error ? error.message : "";
  if (/relation|column|schema|constraint|duplicate key|violates|sql|jwt|token|stack/i.test(message)) {
    return "No se pudo completar la operacion de usuarios.";
  }
  return message || "No se pudo administrar el usuario.";
}

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
  if (request.method !== "POST" || (requestOrigin && !configuredOrigins.includes(requestOrigin))) {
    return json({ error: "Solicitud no permitida." }, corsHeaders, 403);
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!supabaseUrl || !anonKey || !serviceRoleKey) throw new Error("Faltan variables seguras de Supabase.");

    const authHeader = request.headers.get("Authorization") || "";
    const userClient = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authHeader } } });
    const adminClient = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false }
    });
    const { data: authData, error: authError } = await userClient.auth.getUser();
    if (authError || !authData.user) throw new Error("Sesion invalida.");

    const { data: requester, error: requesterError } = await adminClient
      .from("profiles")
      .select("id, role, active, is_master, organization_id")
      .eq("id", authData.user.id)
      .single();
    const requesterIsLightOwner = requester?.role === "MEDICA_ADMIN";
    const requesterCanManage = requester?.is_master || requester?.role === "ADMINISTRADOR" || requesterIsLightOwner;
    if (requesterError || !requester?.active || !requesterCanManage) {
      throw new Error("No tenes permisos para administrar accesos.");
    }
    if (!requester.is_master) {
      const { data: requesterOrganization } = await adminClient.from("organizations").select("commercial_status").eq("id", requester.organization_id).single();
      if (!requesterOrganization || ["SUSPENDIDA", "BAJA"].includes(requesterOrganization.commercial_status)) throw new Error("La organizacion no tiene acceso operativo habilitado.");
    }

    const body = await request.json();
    const action = text(body.action);

    const audit = async (auditAction: string, entityId: string | null, before: unknown, after: unknown) => {
      const { error } = await adminClient.from("audit_logs").insert({
        action: auditAction,
        entity: "profiles",
        entity_id: entityId,
        before,
        after,
        user_id: requester.id
      });
      if (error) console.error("No se pudo registrar auditoria", error.message);
    };

    if (action === "list_users") {
      let query = adminClient
        .from("profiles")
        .select("*, location:locations!profiles_location_id_fkey(*)")
        .eq("is_master", false)
        .order("full_name");
      if (requesterIsLightOwner) query = query.eq("organization_id", requester.organization_id).eq("role", "SECRETARIA");
      else if (!requester.is_master) query = query.eq("organization_id", requester.organization_id).not("role", "in", "(ADMINISTRADOR,MEDICA_ADMIN)");
      const { data: profiles, error } = await query;
      if (error) throw error;
      return json({ profiles: profiles || [] }, corsHeaders);
    }

    if (action === "create_user") {
      const email = text(body.email).toLowerCase();
      const password = String(body.password || "");
      const fullName = text(body.full_name);
      const role = managedRole(body.role);
      if (requesterIsLightOwner && role !== "SECRETARIA") {
        throw new Error("El medico propietario solo puede crear accesos de Secretaria.");
      }
      if (!requester.is_master && (role === "ADMINISTRADOR" || role === "MEDICA_ADMIN")) {
        throw new Error("Solo el usuario Maestro puede crear administradores.");
      }
      const locationId = role === "SECRETARIA" ? text(body.location_id) || null : null;
      const organizationId = requester.is_master ? text(body.organization_id) || requester.organization_id : requester.organization_id;
      const documentNumber = normalizedDocument(body.document_number);
      if (!email.includes("@")) throw new Error("Ingresa un email valido.");
      if (password.length < 8) throw new Error("La contrasena inicial debe tener al menos 8 caracteres.");
      if (!fullName) throw new Error("Ingresa el nombre del usuario.");
      if (documentNumber.length < 6) throw new Error("Ingresa el DNI del usuario.");
      if (role === "SECRETARIA" && !locationId) throw new Error("Asigna un consultorio a la secretaria.");
      const { data: subscription } = await adminClient.from("organization_subscriptions").select("plan:commercial_plans(max_professionals,max_internal_users)").eq("organization_id", organizationId).maybeSingle();
      const plan = Array.isArray(subscription?.plan) ? subscription?.plan[0] : subscription?.plan;
      if (plan?.max_internal_users) {
        const { count } = await adminClient.from("profiles").select("id",{count:"exact",head:true}).eq("organization_id",organizationId).eq("active",true).eq("is_master",false);
        if ((count || 0) >= plan.max_internal_users) throw new Error("La organizacion alcanzo el limite de usuarios de su plan.");
      }
      if ((role === "MEDICO" || role === "MEDICA_ADMIN") && plan?.max_professionals) {
        const { count } = await adminClient.from("profiles").select("id",{count:"exact",head:true}).eq("organization_id",organizationId).eq("active",true).in("role",["MEDICO","MEDICA_ADMIN"]);
        if ((count || 0) >= plan.max_professionals) throw new Error("La organizacion alcanzo el limite de profesionales de su plan.");
      }
      if (locationId) {
        const { data: validLocation } = await adminClient.from("locations").select("id").eq("id", locationId).eq("organization_id", organizationId).maybeSingle();
        if (!validLocation) throw new Error("El consultorio no pertenece a la organizacion elegida.");
      }

      const { data: listed, error: listError } = await adminClient.auth.admin.listUsers({ page: 1, perPage: 1000 });
      if (listError) throw listError;
      const existing = listed.users.find(user => user.email?.toLowerCase() === email);
      let authUser = existing || null;
      if (existing) {
        const { data: existingProfile } = await adminClient.from("profiles").select("id, active").eq("id", existing.id).maybeSingle();
        if (existingProfile?.active) throw new Error("Ya existe un usuario activo con ese email.");
        const { data: updated, error: updateError } = await adminClient.auth.admin.updateUserById(existing.id, {
          email,
          password,
          email_confirm: true,
          ban_duration: "none",
          user_metadata: { full_name: fullName }
        });
        if (updateError) throw updateError;
        authUser = updated.user;
      } else {
        const { data: created, error: createError } = await adminClient.auth.admin.createUser({
          email,
          password,
          email_confirm: true,
          user_metadata: { full_name: fullName }
        });
        if (createError) throw createError;
        authUser = created.user;
      }
      if (!authUser) throw new Error("No se pudo crear o habilitar el acceso.");

      const { data: profile, error: profileError } = await adminClient
        .from("profiles")
        .upsert({
          id: authUser.id,
          email,
          full_name: fullName,
          role,
          location_id: locationId,
          active: true,
          document_number: documentNumber,
          must_change_password: true,
          is_master: false,
          organization_id: organizationId
        })
        .select("*, location:locations!profiles_location_id_fkey(*)")
        .single();
      if (profileError) {
        if (!existing) await adminClient.auth.admin.deleteUser(authUser.id);
        throw profileError;
      }
      await audit("USER_CREATE", authUser.id, null, { email, full_name: fullName, role, location_id: locationId, active: true });
      return json({ profile, temporary_password: password }, corsHeaders);
    }

    const targetId = text(body.user_id);
    if (!targetId) throw new Error("Falta identificar el usuario.");
    const { data: target, error: targetError } = await adminClient
      .from("profiles")
      .select("id, email, full_name, role, location_id, active, document_number, is_master, organization_id")
      .eq("id", targetId)
      .single();
    if (targetError || !target) throw new Error("Usuario no encontrado.");
    if (target.is_master) throw new Error("El usuario Maestro esta protegido.");
    if (!requester.is_master && target.organization_id !== requester.organization_id) throw new Error("El usuario pertenece a otra organizacion.");
    if (requesterIsLightOwner && target.role !== "SECRETARIA") throw new Error("El medico propietario solo puede administrar secretarias.");
    if (!requester.is_master && (target.role === "ADMINISTRADOR" || target.role === "MEDICA_ADMIN")) {
      throw new Error("Solo el usuario Maestro puede administrar a otro administrador.");
    }

    if (action === "reset_password") {
      const temporaryPassword = normalizedDocument(target.document_number);
      if (temporaryPassword.length < 6) throw new Error("Carga el DNI del usuario antes de blanquear su contrasena.");
      const { error: updateAuthError } = await adminClient.auth.admin.updateUserById(target.id, {
        password: temporaryPassword,
        email_confirm: true,
        ban_duration: "none"
      });
      if (updateAuthError) throw updateAuthError;
      const { error: updateProfileError } = await adminClient
        .from("profiles")
        .update({ must_change_password: true, active: true })
        .eq("id", target.id);
      if (updateProfileError) throw updateProfileError;
      await audit("USER_PASSWORD_RESET", target.id, null, { must_change_password: true, active: true });
      return json({ temporary_password: temporaryPassword }, corsHeaders);
    }

    if (action === "confirm_email") {
      const { error: confirmError } = await adminClient.auth.admin.updateUserById(target.id, {
        email_confirm: true,
        ban_duration: "none"
      });
      if (confirmError) throw confirmError;
      const { error: profileError } = await adminClient.from("profiles").update({ active: true }).eq("id", target.id);
      if (profileError) throw profileError;
      await audit("USER_EMAIL_CONFIRMED", target.id, target, { ...target, active: true, email_confirmed: true });
      return json({ enabled: true }, corsHeaders);
    }

    if (action === "delete_user") {
      if (!requester.is_master) throw new Error("Solo el usuario Maestro puede eliminar accesos.");
      if (target.is_master) throw new Error("El usuario Maestro no puede eliminarse.");
      if (target.id === requester.id) throw new Error("No podes eliminar tu propio acceso.");
      const dependencyChecks = [
        ["medical_availability", "doctor_id"], ["appointments", "doctor_id"], ["holidays", "doctor_id"],
        ["clinical_evolutions", "created_by"], ["administrative_notes", "created_by"], ["communications", "created_by"],
        ["attachments", "uploaded_by"]
      ] as const;
      for (const [table, column] of dependencyChecks) {
        const { count, error: dependencyError } = await adminClient.from(table).select("id", { count: "exact", head: true }).eq(column, target.id);
        if (dependencyError && dependencyError.code !== "42703") throw dependencyError;
        if (count) throw new Error("El usuario tiene actividad asociada. Debe bloquearse para conservar la trazabilidad.");
      }
      const { error: authDeleteError } = await adminClient.auth.admin.deleteUser(target.id);
      if (authDeleteError) throw authDeleteError;
      await audit("USER_DELETE", target.id, target, null);
      return json({ deleted: true }, corsHeaders);
    }

    if (action === "set_active") {
      const active = body.active === true;
      if (!active && target.id === requester.id) throw new Error("No podes bloquear tu propio acceso.");

      if (active && target.role === "SECRETARIA" && !target.location_id) {
        throw new Error("Asigna un consultorio antes de reactivar a la secretaria.");
      }

      if (!active) {
        const { error: banError } = await adminClient.auth.admin.updateUserById(target.id, { ban_duration: "876000h" });
        if (banError) throw banError;
        const { data: profile, error: profileError } = await adminClient
          .from("profiles")
          .update({ active: false })
          .eq("id", target.id)
          .select("*, location:locations!profiles_location_id_fkey(*)")
          .single();
        if (profileError) {
          await adminClient.auth.admin.updateUserById(target.id, { ban_duration: "none" });
          throw profileError;
        }
        await audit("USER_BLOCK", target.id, target, { ...target, active: false });
        return json({ profile }, corsHeaders);
      }

      const { data: profile, error: profileError } = await adminClient
        .from("profiles")
        .update({ active: true })
        .eq("id", target.id)
        .select("*, location:locations!profiles_location_id_fkey(*)")
        .single();
      if (profileError) throw profileError;
      const { error: unbanError } = await adminClient.auth.admin.updateUserById(target.id, { ban_duration: "none", email_confirm: true });
      if (unbanError) {
        await adminClient.from("profiles").update({ active: false }).eq("id", target.id);
        throw unbanError;
      }
      await audit("USER_REACTIVATE", target.id, target, { ...target, active: true });
      return json({ profile }, corsHeaders);
    }

    if (action === "update_user") {
      const email = text(body.email).toLowerCase();
      const fullName = text(body.full_name);
      const role = managedRole(body.role);
      if (requesterIsLightOwner && role !== "SECRETARIA") {
        throw new Error("El medico propietario solo puede asignar el rol Secretaria.");
      }
      if (!requester.is_master && (role === "ADMINISTRADOR" || role === "MEDICA_ADMIN")) {
        throw new Error("Solo el usuario Maestro puede asignar el rol Administrador.");
      }
      const locationId = role === "SECRETARIA" ? text(body.location_id) || null : null;
      const documentNumber = normalizedDocument(body.document_number);
      if (!email.includes("@")) throw new Error("Ingresa un email valido.");
      if (!fullName) throw new Error("Ingresa el nombre del usuario.");
      if (documentNumber.length < 6) throw new Error("Ingresa el DNI del usuario.");
      if (role === "SECRETARIA" && target.active && !locationId) throw new Error("Asigna un consultorio a la secretaria.");
      if (locationId) {
        const { data: validLocation } = await adminClient.from("locations").select("id").eq("id", locationId).eq("organization_id", target.organization_id).maybeSingle();
        if (!validLocation) throw new Error("El consultorio no pertenece a la organizacion del usuario.");
      }

      const authPatch: Record<string, unknown> = { user_metadata: { full_name: fullName } };
      if (email !== target.email.toLowerCase()) {
        authPatch.email = email;
        authPatch.email_confirm = true;
      }
      const { error: authUpdateError } = await adminClient.auth.admin.updateUserById(target.id, authPatch);
      if (authUpdateError) throw authUpdateError;

      const { data: profile, error: profileError } = await adminClient
        .from("profiles")
        .update({
          email,
          full_name: fullName,
          role,
          location_id: locationId,
          document_number: documentNumber
        })
        .eq("id", target.id)
        .select("*, location:locations!profiles_location_id_fkey(*)")
        .single();
      if (profileError) {
        await adminClient.auth.admin.updateUserById(target.id, {
          email: target.email,
          email_confirm: true,
          user_metadata: { full_name: target.full_name }
        });
        throw profileError;
      }
      await audit("USER_UPDATE", target.id, target, { email, full_name: fullName, role, location_id: locationId, document_number: documentNumber });
      return json({ profile }, corsHeaders);
    }

    throw new Error("Accion no valida.");
  } catch (error) {
    console.error(error);
    return json({ error: safeErrorMessage(error) }, corsHeaders, 400);
  }
});
