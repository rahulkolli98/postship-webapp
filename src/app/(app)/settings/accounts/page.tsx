import { AccountConnections } from "@/components/settings/AccountConnections";

export const metadata = { title: "Accounts" };

/**
 * /settings/accounts — TASK-026. Route protection handled by src/proxy.ts.
 */
export default function SettingsAccountsPage() {
  return (
    <div className="p-4 md:p-8">
      <AccountConnections />
    </div>
  );
}
