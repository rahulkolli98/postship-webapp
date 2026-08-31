#!/usr/bin/env node
/**
 * TASK-056 — register the Post for Me webhook for this project.
 *
 * Usage (run from webapp/, founder's own terminal):
 *   node scripts/register-pfm-webhook.mjs https://postship-webapp.<sub>.workers.dev
 *
 * Reads POSTFORME_API_KEY from webapp/.env.local (never printed).
 * Contract verified from vendor source (api/src/webhooks/dto/create-webhook.dto.ts):
 *   POST {base}/webhooks  {url, event_types[]}  →  {id, url, secret, event_types}
 * Base URL requires the /v1 prefix (live-API discovery, TASK-051b).
 *
 * The webhook `secret` (whsec_…) is printed ONLY here, in your terminal —
 * copy the printed `npx convex env set` command to store it. Never paste
 * it into chat.
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));

// ── Args ────────────────────────────────────────────────────────────────
const baseUrlArg = process.argv[2];
if (!baseUrlArg) {
  console.error("Usage: node scripts/register-pfm-webhook.mjs <app-base-url>");
  console.error("  e.g. https://postship-webapp.<sub>.workers.dev");
  process.exit(1);
}
let origin;
try {
  origin = new URL(baseUrlArg).origin;
} catch {
  console.error(`Not a valid URL: ${baseUrlArg}`);
  process.exit(1);
}
const webhookUrl = `${origin}/api/webhooks/postforme`;

// ── API key from .env.local (names only in output — values never echo) ──
let apiKey;
try {
  const envFile = readFileSync(join(__dirname, "..", ".env.local"), "utf8");
  const line = envFile
    .split(/\r?\n/)
    .find((l) => l.startsWith("POSTFORME_API_KEY="));
  apiKey = line?.split("=").slice(1).join("=").trim();
} catch {
  /* handled below */
}
if (!apiKey) {
  console.error("POSTFORME_API_KEY not found in webapp/.env.local");
  process.exit(1);
}

// ── Register ────────────────────────────────────────────────────────────
const base = "https://api.postforme.dev/v1";
const body = {
  url: webhookUrl,
  event_types: ["social.post.updated", "social.post.result.created"],
};

let res;
try {
  res = await fetch(`${base}/webhooks`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
} catch (err) {
  console.error("Network error calling Post for Me:", err instanceof Error ? err.message : err);
  process.exit(1);
}

if (!res.ok) {
  const text = await res.text().catch(() => "");
  console.error(`Post for Me rejected registration (${res.status}):`);
  console.error(text.slice(0, 500));
  process.exit(1);
}

const created = await res.json().catch(() => ({}));

// ── Report (secret shown once, here in your terminal only) ──────────────
console.log("");
console.log("Webhook registered ✅");
console.log(`  id:           ${created.id ?? "(unknown)"}`);
console.log(`  url:          ${created.url ?? webhookUrl}`);
console.log(`  event_types:  ${(created.event_types ?? body.event_types).join(", ")}`);
console.log("");
if (created.secret) {
  console.log("Now store the signing secret (copy-paste this command):");
  console.log("");
  console.log(`  npx convex env set POSTFORME_WEBHOOK_SECRET ${created.secret}`);
  console.log("");
  console.log("Then verify with: npx convex env list | Select-String POSTFORME_WEBHOOK");
} else {
  console.error("No secret in response — check the webhook in the PFM dashboard.");
}
