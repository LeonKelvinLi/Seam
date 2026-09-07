import { LegalPage, Section } from "@/components/Legal";
export const metadata = { title: "Refund Policy — SeamCut" };
export default function RefundsPage() {
  return (
    <LegalPage title="Refund Policy" intro="Credits are prepaid. Here is exactly when money comes back.">
      <Section heading="Failed generations">
        <p>If a generation fails, the credits it consumed are returned to your balance automatically. You do not need to ask.</p>
      </Section>
      <Section heading="Unused credits">
        <p>You can request a full refund of a credit pack within 14 days of purchase if none of its credits have been used. Partially used packs are refunded pro rata for the unused credits, minus payment-processing fees, at our discretion.</p>
      </Section>
      <Section heading="Quality complaints">
        <p>Generated bridges vary in quality and previews exist so you can judge before spending on a final render. We do not refund credits for results you dislike, but if a result is clearly broken (black frames, corrupted file, wrong clips), contact us within 7 days and we will restore the credits.</p>
      </Section>
      <Section heading="How to request">
        <p>Write to us from the email on your account with the purchase date and amount. Refunds go back to the original payment method and usually appear within 5 to 10 business days.</p>
      </Section>
    </LegalPage>
  );
}
