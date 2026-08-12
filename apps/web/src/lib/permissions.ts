import type { Permission } from "@codeforge/shared";
import type { StaffUser } from "./api";

/**
 * Mirrors the backend's requirePermission semantics (apps/api/src/middleware/
 * auth.ts): super_admin always passes; an empty `permissions` array means
 * unrestricted within the account's role (today's behavior, unchanged for
 * every account that predates this feature); a non-empty array is an
 * explicit allow-list. This is UX only — the actual boundary is enforced
 * server-side regardless of what any given screen shows or hides.
 */
export function can(user: StaffUser, ...keys: Permission[]): boolean {
  if (user.role === "super_admin") return true;
  if (user.permissions.length === 0) return true;
  return keys.some((k) => user.permissions.includes(k));
}
