import { LegalPage, Section } from "@/components/Legal";
export const metadata = { title: "Terms of Service — SeamCut" };
export default function TermsPage() {
  return (
    <LegalPage title="Terms of Service" intro="The short version: your footage stays yours, our transitions are yours to use, and you agree not to upload what you have no right to use.">
      <Section heading="1. The service">
        <p>SeamCut generates short transition clips ("bridges") between two pieces of footage you upload, and stitches them into a shareable result. Generation runs on our servers and on third-party AI model providers we select. Output quality varies with the footage; a generation can fail, in which case the credits it consumed are returned automatically.</p>
      </Section>
      <Section heading="2. Accounts and credits">
        <p>You can try SeamCut as a guest; creating an account keeps your projects and credits across devices. Credits are prepaid units consumed per generation (currently one for a preview, three for a final-quality render). Credits are not a currency, do not expire, and are not transferable. Prices are shown before purchase; taxes may apply based on your location.</p>
        <p>You are responsible for keeping your password confidential and for activity under your account.</p>
      </Section>
      <Section heading="3. Your content">
        <p>You keep all rights to the footage you upload and to the results you generate. You grant us a limited licence to store, process and transmit your content solely to provide the service, including sending frames and clips to the AI providers that generate your bridge. You must own or have permission to use everything you upload, including people, music and brands that appear in it.</p>
      </Section>
      <Section heading="4. Acceptable use">
        <p>Do not upload content that is unlawful, infringing, sexually explicit involving minors, or intended to harass, deceive or impersonate. Do not attempt to overload, reverse-engineer or gain unauthorised access to the service. We may suspend accounts that break these rules and may remove content on notice from rights holders.</p>
      </Section>
      <Section heading="5. AI output">
        <p>Bridges are machine-generated. They can contain artefacts, hallucinated details, or likenesses that differ from your footage. Review every result before publishing it. We do not guarantee that generated output is free of third-party claims.</p>
      </Section>
      <Section heading="6. Availability and changes">
        <p>We may change features, models and prices, and we may take the service offline for maintenance. We will give reasonable notice of material changes to paid features where practical.</p>
      </Section>
      <Section heading="7. Disclaimer and liability">
        <p>The service is provided "as is". To the fullest extent permitted by law, we are not liable for indirect or consequential losses, and our total liability for any claim is limited to the amount you paid us in the twelve months before the claim.</p>
      </Section>
      <Section heading="8. Termination">
        <p>You can delete your account at any time by contacting us; unused credits are handled under the refund policy. We may terminate accounts that violate these terms.</p>
      </Section>
      <Section heading="9. Governing law">
        <p>These terms are governed by the laws of the jurisdiction in which the operating company is organised, without regard to conflict-of-law rules. Disputes will be brought in the courts of that jurisdiction.</p>
      </Section>
    </LegalPage>
  );
}
