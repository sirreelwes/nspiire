import type { Metadata } from "next";
import { LegalPage, Section } from "@/app/legal-ui";

export const metadata: Metadata = {
  title: "Terms of Service · Nspiire",
  description: "The terms you agree to when you use Nspiire.",
};

export default function TermsPage() {
  return (
    <LegalPage title="Terms of Service" updated="31 August 2026">
      <Section heading="Who these terms are with">
        <p>
          Nspiire is operated by VerMar Design LLC (&ldquo;we&rdquo;). By creating
          an account or using the service you agree to these terms. If you do not
          agree, do not use Nspiire. Questions: wes@vermardesign.com.
        </p>
      </Section>

      <Section heading="What Nspiire does">
        <p>
          Nspiire helps social media creators find brand partners and price
          sponsorship deals. It suggests brands, recommends rates based on your own
          audience metrics and the rate card you set, drafts outreach, and tracks
          deals through to payment.
        </p>
        <p>
          Nspiire acts on your instructions. It is not your legal representative,
          your agent in the legal sense, your accountant, or your lawyer.
        </p>
      </Section>

      <Section heading="You stay in control">
        <p>
          Nothing is sent to a brand, no terms are accepted, no contract is issued,
          and no money moves without your explicit approval. Two approval gates
          cannot be switched off: anything outside the guardrails you set, and
          anything involving money. That is a property of the product, not a
          setting.
        </p>
        <p>
          Rates and terms Nspiire recommends are suggestions based on your figures
          and on comparable closed deals. They are not valuations, and they are not
          a promise of what a brand will pay. Every deal you accept is your
          decision.
        </p>
      </Section>

      <Section heading="Your account and your content">
        <p>
          You are responsible for the accuracy of what you enter — your rate card,
          your guardrails, and any metrics you enter by hand. You keep ownership of
          your content and your data. You grant us only the permission needed to
          operate the service for you.
        </p>
        <p>
          Keep your login secure. Tell us promptly if you believe someone else has
          access to your account.
        </p>
      </Section>

      <Section heading="Connected platforms">
        <p>
          If you connect a platform account such as TikTok, you authorise us to
          read the data described in our{" "}
          <a href="/privacy" className="underline underline-offset-4">
            Privacy Policy
          </a>
          . You can disconnect at any time. Your use of those platforms remains
          governed by their own terms.
        </p>
      </Section>

      <Section heading="Payments">
        <p>
          Nspiire tracks invoices and payments. It does not hold, receive, or
          transmit your money — funds move directly between you and the brand, or
          through a payment provider you are told about at the time.
        </p>
      </Section>

      <Section heading="Availability and liability">
        <p>
          The service is provided as-is. We do not guarantee uninterrupted
          availability, and we do not guarantee that any brand will respond, agree
          terms, or pay. To the extent the law allows, we are not liable for lost
          deals, lost income, or indirect losses arising from your use of Nspiire.
        </p>
      </Section>

      <Section heading="Ending it">
        <p>
          You may stop using Nspiire and request deletion of your data at any time
          — see the Privacy Policy. We may suspend an account that is being used
          unlawfully or in a way that endangers the service or other users.
        </p>
      </Section>

      <Section heading="Governing law">
        <p>These terms are governed by the laws of the State of Texas, United States.</p>
      </Section>
    </LegalPage>
  );
}
