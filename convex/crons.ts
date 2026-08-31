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

export default crons;
