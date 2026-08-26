/** Mirrors apps/hq-api/src/lib/permissions.ts — labels only, enforcement lives server-side. */
export const HQ_PERMISSIONS = ["clients", "leads", "provisioning", "team", "support", "contests"] as const;
export type HqPermission = (typeof HQ_PERMISSIONS)[number];

export const HQ_PERMISSION_LABELS: Record<HqPermission, string> = {
  clients: "Client accounts and CRM",
  leads: "Marketing leads inbox",
  provisioning: "Deployment provisioning",
  team: "HQ team management",
  support: "Client support tickets",
  contests: "Arena contests",
};
