export const metadata = {
  title: "Privacy Policy",
};

/**
 * /privacy — TASK-079. Public route (src/proxy.ts). Copy approved by the
 * founder before shipping; these URLs are also used in Paddle's website
 * verification.
 */
export default function PrivacyPage() {
  return (
    <main className="p-4 md:p-8">
      <div className="mx-auto flex max-w-3xl flex-col gap-6 pb-16">
        <p className="font-mono text-[11px] font-semibold uppercase tracking-[0.18em] text-on-surface-muted">
          Privacy Policy
        </p>
        <h1 className="font-newsreader text-4xl font-medium leading-[1.05] tracking-[-0.02em] text-on-surface md:text-[48px]">
          Privacy Policy
        </h1>
        <p className="font-sans text-[13px] text-on-surface-muted">
          Last updated: September 2026
        </p>

        <div className="flex flex-col gap-6 font-sans text-[15px] leading-[1.65] text-on-surface">
          <p>
            Postship (&quot;Postship&quot;, &quot;we&quot;, &quot;us&quot;)
            operates the website postship.app and the Postship web
            application. Contact: techwithkolli@gmail.com.
          </p>

          <section>
            <h2 className="text-[19px] font-semibold text-on-surface">What we collect</h2>
            <p className="mt-2">
              <strong>Account data via Clerk:</strong> name, email address, and
              profile photo when you sign in. Clerk is our authentication
              provider and stores your login session.
            </p>
            <p className="mt-2">
              <strong>Your content:</strong> master descriptions and the
              generated captions you edit, stored in our Convex database.
              Videos are stored transiently and are automatically deleted from
              our storage after publishing (at most 48 hours after your last
              publish attempt for a post). We do not use your videos to train
              anything.
            </p>
            <p className="mt-2">
              <strong>Your connections:</strong> when you connect a platform,
              Post for Me (our publishing backend) handles the platform OAuth
              consent and stores the connection tokens. We store only
              connection identifiers (account IDs, usernames).
            </p>
            <p className="mt-2">
              <strong>Payment data via Paddle:</strong> payments are processed
              by Paddle (paddle.com), our Merchant of Record. Paddle handles
              your card details, taxes, invoices, and billing disputes. We
              never see or store your card details. We store only your Paddle
              customer ID.
            </p>
            <p className="mt-2">
              <strong>AI processing:</strong> your master description is sent
              to OpenRouter, our AI provider, to generate platform-native
              captions. Generated captions are yours and stored with each
              post.
            </p>
            <p className="mt-2">
              <strong>Analytics via PostHog:</strong> we collect usage events
              (pages viewed, posts shipped, plan changes) tied to an internal
              user ID. We do not send your email address or content to
              PostHog.
            </p>
            <p className="mt-2">
              <strong>Transactional email via Resend:</strong> we use Resend
              to deliver welcome and trial-expiry emails.
            </p>
          </section>

          <section>
            <h2 className="text-[19px] font-semibold text-on-surface">
              What we don&apos;t do
            </h2>
            <p className="mt-2">
              We don&apos;t sell your data, we don&apos;t train foundation
              models, and there are no private conversations for us to read.
              The product is one screen.
            </p>
          </section>

          <section>
            <h2 className="text-[19px] font-semibold text-on-surface">
              Your rights
            </h2>
            <p className="mt-2">
              You can disconnect platforms or delete drafts from the app at
              any time. Policy changes will be posted on this page. Contact
              techwithkolli@gmail.com for data questions or deletion
              requests.
            </p>
          </section>
        </div>
      </div>
    </main>
  );
}
