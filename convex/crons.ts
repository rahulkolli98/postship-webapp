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

export default crons;
