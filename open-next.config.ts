import { defineCloudflareConfig } from "@opennextjs/cloudflare";

export default defineCloudflareConfig({
  // Incremental cache (R2) not needed for the webapp yet — add if ISR/
  // cache-heavy routes appear.
});
