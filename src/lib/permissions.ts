// Mirrors public.role_permissions() in the database. The database is the
// enforcement point; this copy only decides what the UI shows.
export type Role = "mso_admin" | "owner" | "advisor" | "technician" | "parts_specialist";

export type Permission =
  | "board.view"
  | "ro.create"
  | "ro.transition"
  | "ro.reopen"
  | "ro.archive"
  | "ro.assign_bay"
  | "dvi.view"
  | "dvi.edit"
  | "dvi.send"
  | "qc.signoff"
  | "messages.view"
  | "messages.send"
  | "customers.consent"
  | "parts.manage"
  | "settings.shop"
  | "settings.pipeline"
  | "staff.manage"
  | "reports.shop"
  | "reports.mso";

const advisor: Permission[] = [
  "board.view",
  "ro.create",
  "ro.transition",
  "ro.assign_bay",
  "ro.archive",
  "dvi.view",
  "dvi.edit",
  "dvi.send",
  "qc.signoff",
  "messages.view",
  "messages.send",
  "customers.consent",
  "settings.shop",
  "settings.pipeline",
  "reports.shop",
];
const technician: Permission[] = [
  "board.view",
  "ro.transition",
  "dvi.view",
  "dvi.edit",
  "qc.signoff",
];
const parts: Permission[] = ["board.view", "parts.manage", "ro.transition"];
const owner: Permission[] = [
  ...new Set<Permission>([...advisor, ...technician, ...parts, "ro.reopen", "staff.manage"]),
];
const mso: Permission[] = [...owner, "reports.mso"];

export const ROLE_PERMISSIONS: Record<Role, ReadonlySet<Permission>> = {
  advisor: new Set(advisor),
  technician: new Set(technician),
  parts_specialist: new Set(parts),
  owner: new Set(owner),
  mso_admin: new Set(mso),
};

export const can = (role: Role | null | undefined, p: Permission): boolean =>
  !!role && ROLE_PERMISSIONS[role].has(p);

export const ROLE_LABELS: Record<Role, string> = {
  mso_admin: "MSO admin",
  owner: "Owner",
  advisor: "Service advisor",
  technician: "Technician",
  parts_specialist: "Parts specialist",
};
