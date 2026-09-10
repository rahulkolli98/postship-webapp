export const metadata = {
  title: "Terms of Service",
};

/**
 * /terms — TASK-079. Public route (src/proxy.ts). Copy approved by the
 * founder before shipping; URL also used in Paddle's website verification.
 */
export default function TermsPage() {
  return (
    <main className="p-4 md:p-8">
      <div className="mx-auto flex max-w-3xl flex-col gap-6 pb-16">
        <p className="font-mono text-[11px] font-semibold uppercase tracking-[0.18em] text-on-surface-muted">
          Terms of Service
        </p>
        <h1 className="font-newsreader text-4xl font-medium leading-[1.05] tracking-[-0.02em] text-on-surface md:text-[48px]">
          Terms of Service
        </h1>
        <p className="font-sans text-[13px] text-on-surface-muted">
          Last updated: September 2026
        </p>

        <div className="flex flex-col gap-6 font-sans text-[15px] leading-[1.65] text-on-surface">
          <section>
            <h2 className="text-[19px] font-semibold text-on-surface">The service</h2>
            <p className="mt-2">
              Postship turns one master description into platform-native
              captions and publishes them to connected platforms through Post
              for Me. We built it to be honest about what it is: an AI writing
              and publishing tool. It is not a video editor and we have never
              claimed otherwise.
            </p>
          </section>

          <section>
            <h2 className="text-[19px] font-semibold text-on-surface">
              Payments: Paddle is our Merchant of Record
            </h2>
            <p className="mt-2">
              Subscriptions are sold and processed by Paddle (paddle.com).
              Paddle is the seller of record and handles billing, taxes,
              invoices, and refunds under Paddle&apos;s terms (paddle.com/legal).
              Charges appear on your statement through Paddle.
            </p>
          </section>

          <section>
            <h2 className="text-[19px] font-semibold text-on-surface">Plans</h2>
            <p className="mt-2">
              The 7-day trial includes 5 posts and requires no card. After the
              trial, publishing requires a paid plan: Creator ($12/month) or
              Pro ($19/month) as shown in the app. Subscriptions renew monthly
              through Paddle until cancelled. You can cancel anytime from the
              Paddle customer portal. Your drafts remain accessible even if
              publishing stops. There is no permanent free tier.
            </p>
          </section>

          <section>
            <h2 className="text-[19px] font-semibold text-on-surface">
              Acceptable use
            </h2>
            <p className="mt-2">
              Don&apos;t upload content you don&apos;t have rights to, don&apos;t
              break the rules of the platforms you publish to, and don&apos;t
              use Postship for spam, harassment, or anything unlawful.
            </p>
          </section>

          <section>
            <h2 className="text-[19px] font-semibold text-on-surface">
              Availability
            </h2>
            <p className="mt-2">
              Postship is provided as-is. We ship in public and improve
              constantly, but there is no service-level commitment in these
              terms. If something breaks, email us and we&apos;ll actually
              respond.
            </p>
          </section>

          <section>
            <h2 className="text-[19px] font-semibold text-on-surface">
              Termination
            </h2>
            <p className="mt-2">
              You can cancel anytime via the Paddle customer portal. We may
              suspend accounts for abuse of the platform or these terms.
            </p>
          </section>

          <section>
            <h2 className="text-[19px] font-semibold text-on-surface">
              Governing law
            </h2>
            <p className="mt-2">
              These terms are governed by the laws of India. Disputes will
              first be addressed by contacting techwithkolli@gmail.com.
            </p>
          </section>
        </div>
      </div>
    </main>
  );
}
