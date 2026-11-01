import { audit, type AuditEvent } from "./audit";
import { authenticatedUserId } from "./authenticated-user";

/**
 * Audit yang otomatis menautkan user bila ada sesi (brief §14: audit otorisasi per user).
 * Tanpa cookie sesi tidak ada query database; kegagalan lookup tidak pernah menggagalkan request.
 */
export async function auditFor(request: Request, event: AuditEvent): Promise<void> {
  let userId: string | undefined;
  try {
    userId = (await authenticatedUserId(request)) ?? undefined;
  } catch {
    /* audit bersifat best-effort untuk endpoint baca/parse */
  }
  await audit(userId ? { ...event, userId } : event);
}