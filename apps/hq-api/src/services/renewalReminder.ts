import { prisma } from "../lib/prisma";
import { logger } from "../lib/logger";
import { sendRenewalReminderAlert } from "../lib/alerts";
import { notify } from "./notify";

// Daily is plenty for a reminder window measured in days, not minutes —
// deliberately much coarser than healthMonitor.ts's 5-minute poll.
const POLL_INTERVAL_MS = 24 * 60 * 60 * 1000;
const REMINDER_WINDOW_DAYS = 14;
// A prior reminder counts as "for this renewal" only if it was sent within
// this many days of the current nextRenewalDate — anything older means the
// date was pushed out since (renewed, or rescheduled), so it's due again.
const STALE_REMINDER_DAYS = 45;

async function checkOne(client: {
  id: string;
  companyName: string;
  nextRenewalDate: Date;
  renewalReminderSentAt: Date | null;
  mrrCents: number | null;
}): Promise<void> {
  const now = Date.now();
  const daysUntil = Math.ceil((client.nextRenewalDate.getTime() - now) / (24 * 60 * 60 * 1000));
  if (daysUntil < 0 || daysUntil > REMINDER_WINDOW_DAYS) return;

  const staleThreshold = client.nextRenewalDate.getTime() - STALE_REMINDER_DAYS * 24 * 60 * 60 * 1000;
  const alreadyReminded = client.renewalReminderSentAt && client.renewalReminderSentAt.getTime() > staleThreshold;
  if (alreadyReminded) return;

  await sendRenewalReminderAlert({
    companyName: client.companyName,
    clientId: client.id,
    nextRenewalDate: client.nextRenewalDate,
    daysUntil,
    mrrCents: client.mrrCents,
  }).catch((err) => logger.error({ err, clientId: client.id }, "renewal reminder alert failed"));
  notify(
    "renewal_reminder",
    `${client.companyName}'s renewal is in ${daysUntil} day${daysUntil === 1 ? "" : "s"}`,
    client.nextRenewalDate.toLocaleDateString(),
    `/clients/${client.id}`
  );

  await prisma.client.update({ where: { id: client.id }, data: { renewalReminderSentAt: new Date() } });
}

async function pollAll(): Promise<void> {
  const windowEnd = new Date(Date.now() + REMINDER_WINDOW_DAYS * 24 * 60 * 60 * 1000);
  const clients = await prisma.client.findMany({
    where: { nextRenewalDate: { not: null, lte: windowEnd } },
    select: { id: true, companyName: true, nextRenewalDate: true, renewalReminderSentAt: true, mrrCents: true },
  });
  for (const client of clients) {
    if (!client.nextRenewalDate) continue;
    await checkOne({ ...client, nextRenewalDate: client.nextRenewalDate }).catch((err) =>
      logger.error({ err, clientId: client.id }, "renewal reminder check failed")
    );
  }
}

export function startRenewalReminder(): { stop: () => void } {
  const timer = setInterval(() => void pollAll(), POLL_INTERVAL_MS);
  void pollAll();
  return { stop: () => clearInterval(timer) };
}
