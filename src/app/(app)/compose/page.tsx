import { Composer } from "@/components/composer/Composer";

export const metadata = { title: "Compose" };

/**
 * /compose — TASK-023. Route protection handled by src/proxy.ts.
 */
export default function ComposePage() {
  return <Composer />;
}
