import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

function json(body: unknown, headers: Record<string, string>, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...headers, "Content-Type": "application/json" } });
}

Deno.serve(async request => {
  const allowedOrigins = (Deno.env.get("CORS_ORIGIN") || "https://cardioayala.vercel.app,http://localhost:5173")
    .split(",")
    .map(value => value.trim());
  const origin = request.headers.get("Origin") || "";
  const corsHeaders = {
    "Access-Control-Allow-Origin": allowedOrigins.includes(origin) ? origin : allowedOrigins[0],
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin"
  };

  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST" || (origin && !allowedOrigins.includes(origin))) {
    return json({ error: "Solicitud no permitida." }, corsHeaders, 403);
  }

  const invalidCredentials = () => json({ error: "Usuario o contraseña incorrectos." }, corsHeaders, 400);

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!supabaseUrl || !anonKey || !serviceRoleKey) throw new Error("Configuración incompleta.");

    const body = await request.json();
    const documentNumber = String(body.identifier || "").replace(/\D/g, "");
    const password = String(body.password || "");
    if (documentNumber.length < 6 || !password) return invalidCredentials();

    const adminClient = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data: profiles, error: profileError } = await adminClient
      .from("profiles")
      .select("email, active")
      .eq("document_number", documentNumber)
      .eq("active", true)
      .limit(2);
    if (profileError || profiles?.length !== 1 || !profiles[0]?.email) return invalidCredentials();

    const authClient = createClient(supabaseUrl, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data, error } = await authClient.auth.signInWithPassword({ email: profiles[0].email, password });
    if (error || !data.session) return invalidCredentials();

    return json({
      access_token: data.session.access_token,
      refresh_token: data.session.refresh_token
    }, corsHeaders);
  } catch (error) {
    console.error(error);
    return invalidCredentials();
  }
});
