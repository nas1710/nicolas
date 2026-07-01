import { useEffect, useState } from "react";
import { getOrganizationCommercialAccount, OrganizationCommercialAccount, Profile } from "../../api/supabase";

export function CommercialAccountBanner({profile}:{profile:Profile}){
 const [account,setAccount]=useState<OrganizationCommercialAccount|null>(null);
 useEffect(()=>{if(profile.role!=="ADMINISTRADOR"||profile.is_master)return;getOrganizationCommercialAccount().then(setAccount).catch(()=>setAccount(null));},[profile.id,profile.is_master,profile.role]);
 if(!account)return null;
 const urgent=account.commercial_status==="SUSPENDIDA"||account.commercial_status==="BAJA"||account.subscription_status==="SUSPENDIDA"||account.subscription_status==="CANCELADA";
 const expired=account.subscription_status==="VENCIDA";
 const due=account.days_remaining!=null&&account.days_remaining>=0&&account.days_remaining<=15;
 if(!urgent&&!expired&&!due&&account.subscription_status!=="PRUEBA")return null;
 const message=urgent?"La cuenta esta suspendida. Podes consultar la informacion existente, pero no crear nuevas operaciones.":expired?"La cuenta esta vencida. La operacion continua disponible mientras se regulariza el estado comercial.":account.subscription_status==="PRUEBA"?`Periodo de prueba: ${account.days_remaining??"sin"} dias restantes.`:`El plan vence en ${account.days_remaining} dias.`;
 return <aside className={`commercial-account-banner ${urgent||expired?"warning":""}`}><div><strong>{account.organization_name}</strong><span>{message}</span></div><small>{account.plan_name||"Sin plan"}{account.expires_on?` · Vence ${new Date(`${account.expires_on}T12:00:00-03:00`).toLocaleDateString("es-AR")}`:""}</small></aside>;
}
