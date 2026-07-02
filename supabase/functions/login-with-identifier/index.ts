import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

function json(body: unknown, headers: Record<string, string>, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...headers, "Content-Type": "application/json" } });
}

function maskIdentifier(value: string) {
  if (value.includes("@")) {
    const [name, domain] = value.split("@");
    return `${name.slice(0, 2)}***@${domain || ""}`;
  }
  return value.length > 4 ? `***${value.slice(-4)}` : "***";
}

async function sha256(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest)).map(byte => byte.toString(16).padStart(2, "0")).join("");
}

Deno.serve(async request => {
  const allowedOrigins = (Deno.env.get("CORS_ORIGIN") || "https://cardioayala.vercel.app,http://localhost:5173")
    .split(",").map(value => value.trim());
  const origin = request.headers.get("Origin") || "";
  const corsHeaders = {
    "Access-Control-Allow-Origin": allowedOrigins.includes(origin) ? origin : allowedOrigins[0],
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS", "Vary": "Origin"
  };
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST" || (origin && !allowedOrigins.includes(origin))) return json({ error: "Solicitud no permitida." }, corsHeaders, 403);

  const invalidCredentials = () => json({ error: "Usuario o contraseña incorrectos." }, corsHeaders, 400);
  let adminClient: ReturnType<typeof createClient> | null = null;
  let identifier = "";
  let ipHash = "";
  let profile: { id: string; email: string; active: boolean; role: string; organization_id: string | null } | null = null;

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!supabaseUrl || !anonKey || !serviceRoleKey) throw new Error("Configuración incompleta.");
    const body = await request.json();
    identifier = String(body.identifier || "").trim().toLowerCase();
    const password = String(body.password || "");
    if (!identifier || !password) return invalidCredentials();
    const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
    ipHash = await sha256(forwarded);
    adminClient = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });

    const { count: recentFailures } = await adminClient.from("audit_logs").select("id", { count: "exact", head: true })
      .eq("action", "SESSION_LOGIN_FAILED").eq("after->>ip_hash", ipHash)
      .gte("created_at", new Date(Date.now() - 15 * 60_000).toISOString());
    if ((recentFailures || 0) >= 10) return json({ error: "Demasiados intentos. Esperá unos minutos y volvé a probar." }, corsHeaders, 429);

    const query = adminClient.from("profiles").select("id,email,active,role,organization_id").limit(2);
    const lookup = identifier.includes("@") ? query.eq("email", identifier) : query.eq("document_number", identifier.replace(/\D/g, ""));
    const { data: profiles, error: profileError } = await lookup;
    if (profileError || profiles?.length !== 1 || !profiles[0]?.email || !profiles[0].active) throw new Error("invalid");
    profile = profiles[0];

    const authClient = createClient(supabaseUrl, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data, error } = await authClient.auth.signInWithPassword({ email: profile.email, password });
    if (error || !data.session) throw new Error("invalid");
    await adminClient.from("audit_logs").insert({
      action: "SESSION_LOGIN_SUCCESS", entity: "session", entity_id: profile.id, user_id: profile.id,
      organization_id: profile.organization_id,
      after: { result: "SUCCESS", role: profile.role, identifier_masked: maskIdentifier(identifier), ip_hash: ipHash }
    });
    return json({ access_token: data.session.access_token, refresh_token: data.session.refresh_token }, corsHeaders);
  } catch (error) {
    console.error(error);
    if (adminClient) await adminClient.from("audit_logs").insert({
      action: "SESSION_LOGIN_FAILED", entity: "session", entity_id: null, user_id: null,
      organization_id: profile?.organization_id || null,
      after: { result: "FAILED", identifier_masked: maskIdentifier(identifier), ip_hash: ipHash }
    });
    return invalidCredentials();
  }
});
