/**
 * HQ's own capability catalog — deliberately separate from
 * @codeforge/shared's PERMISSIONS (that one gates the per-client product;
 * this one gates CodeForge's internal ops tool). Mirrored verbatim in
 * apps/hq/src/lib/permissions.ts for the checkbox UI's labels; the backend
 * copy here is the one that's actually enforced.
 */
export const HQ_PERMISSIONS = ["clients", "leads", "provisioning", "team", "support"] as const;
export type HqPermission = (typeof HQ_PERMISSIONS)[number];

export const HQ_PERMISSION_LABELS: Record<HqPermission, string> = {
  clients: "Client accounts and CRM",
  leads: "Marketing leads inbox",
  provisioning: "Deployment provisioning",
  team: "HQ team management",
  support: "Client support tickets",
};
