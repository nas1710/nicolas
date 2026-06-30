import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const text=(value:unknown)=>String(value??"").trim();
const response=(body:unknown,headers:Record<string,string>,status=200)=>new Response(JSON.stringify(body),{status,headers:{...headers,"Content-Type":"application/json"}});

Deno.serve(async request=>{
 const origins=(Deno.env.get("CORS_ORIGIN")||"https://cardioayala.vercel.app,http://localhost:5173").split(",").map(item=>item.trim());
 const origin=request.headers.get("Origin")||""; const headers={"Access-Control-Allow-Origin":origins.includes(origin)?origin:origins[0],"Access-Control-Allow-Headers":"authorization, x-client-info, apikey, content-type","Access-Control-Allow-Methods":"POST, OPTIONS","Vary":"Origin"};
 if(request.method==="OPTIONS")return new Response("ok",{headers});
 try{
  const url=Deno.env.get("SUPABASE_URL"),key=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");if(!url||!key)throw new Error("Configuracion incompleta.");
  const body=await request.json();const email=text(body.email).toLowerCase(),password=String(body.password||""),fullName=text(body.full_name),website=text(body.website);
  if(website)return response({requested:true},headers);
  if(!email.includes("@"))throw new Error("Ingresa un email valido.");if(password.length<8)throw new Error("La contrasena debe tener al menos 8 caracteres.");if(!fullName)throw new Error("Ingresa nombre y apellido.");
  const admin=createClient(url,key,{auth:{autoRefreshToken:false,persistSession:false}});
  const {data:list,error:listError}=await admin.auth.admin.listUsers({page:1,perPage:1000});if(listError)throw listError;
  const existing=list.users.find(user=>user.email?.toLowerCase()===email);
  if(existing)throw new Error("Ya existe una solicitud o un usuario con ese email. Consulta al Master.");
  const {data,error}=await admin.auth.admin.createUser({email,password,email_confirm:true,user_metadata:{full_name:fullName}});if(error)throw error;const user=data.user;
  if(!user)throw new Error("No se pudo registrar la solicitud.");
  const {error:profileError}=await admin.from("profiles").upsert({id:user.id,email,full_name:fullName,role:"SECRETARIA",location_id:null,active:false,is_master:false,must_change_password:false});if(profileError){await admin.auth.admin.deleteUser(user.id);throw profileError;}
  return response({requested:true},headers);
 }catch(error){return response({error:error instanceof Error?error.message:"No se pudo solicitar el acceso."},headers,400);}
});
