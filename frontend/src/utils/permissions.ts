import type { Profile, Role } from "../api/supabase";

export const isMaster = (profile: Pick<Profile, "is_master">) => profile.is_master;
export const isAdministratorRole = (role: Role) => role === "ADMINISTRADOR";
export const isDoctorRole = (role: Role) => role === "MEDICO" || role === "MEDICA_ADMIN";
export const canAccessClinical = (profile: Pick<Profile, "role" | "is_master">) => profile.is_master || isAdministratorRole(profile.role) || isDoctorRole(profile.role);
export const canManageConfiguration = (profile: Pick<Profile, "role" | "is_master">) => profile.is_master || isAdministratorRole(profile.role) || isDoctorRole(profile.role);
export const canManageUsers = (profile: Pick<Profile, "role" | "is_master">) => profile.is_master || isAdministratorRole(profile.role);

export function roleLabel(profile: Pick<Profile, "role" | "is_master" | "location">) {
  if (profile.is_master) return "Maestro";
  if (profile.role === "ADMINISTRADOR") return "Administrador";
  if (isDoctorRole(profile.role)) return "Medico";
  return profile.location?.name || "Secretaria";
}
