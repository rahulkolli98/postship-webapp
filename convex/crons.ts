import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

/**
 * TASK-056 Phase A storage policy, daily pass:
 * - reconcile posts stuck in "uploading" >30min (missed webhooks) against
 *   the Post for Me API,
 * - purge media from shipped posts older than 48h (retry window closed).
 */
crons.interval("media-sweep", { hours: 24 }, internal.posts.sweepMedia, {});

/**
 * TASK-069: trial-expiry-24h notice, daily at 14:00 UTC. Emails trial
 * users whose 7-day clock expires within the next 24h (marks
 * trialExpiryNotified so nobody gets it twice).
 */
crons.daily(
  "trial-expiry-emails",
  { hourUTC: 14, minuteUTC: 0 },
  internal.emails.sendTrialExpiryEmails,
  {},
);

/**
 * TASK-075: Post for Me brand-health check, daily at 03:00 UTC. Flags
 * account rows whose sa_ connection is no longer connected at PFM
 * (needsReconnect) and clears the flag when healthy again.
 */
crons.daily(
  "brand-health",
  { hourUTC: 3, minuteUTC: 0 },
  internal.brandHealth.checkBrandHealth,
  {},
);

export default crons;
