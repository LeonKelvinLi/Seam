import { LegalPage, Section } from "@/components/Legal";
export const metadata = { title: "Privacy Policy — Clipmelt" };
export default function PrivacyPage() {
  return (
    <LegalPage title="Privacy Policy" intro="What we collect, why, who processes it, and how to get it deleted.">
      <Section heading="What we collect">
        <p><strong>Account data:</strong> your email address and a salted hash of your password. Guests get a random identifier stored in a cookie.</p>
        <p><strong>Content:</strong> the clips and images you upload, frames extracted from them, generated bridges and exports.</p>
        <p><strong>Usage and billing:</strong> which link or site first brought you here (campaign tags, referring site, landing page), which features you use, generation outcomes and quality scores, credit balance, and purchase records. Card details are handled by Stripe and never reach our servers.</p>
        <p><strong>Technical:</strong> IP address and browser type in request logs, kept briefly for security and abuse prevention.</p>
      </Section>
      <Section heading="Why we process it">
        <p>To run the service (store your projects, generate transitions, deliver downloads), to bill you, to keep the service secure, and to improve transition quality by learning which recipes work. We do not sell personal data and we do not run third-party advertising trackers.</p>
      </Section>
      <Section heading="Who processes it for us">
        <p>Hosting and storage: Render (United States). Payments: Stripe. AI generation and analysis, only when a generation runs: the model providers configured for the service, which may include OpenAI, fal.ai, Runway and Higgsfield. Each receives only the frames or clips needed for that job.</p>
      </Section>
      <Section heading="Cookies">
        <p>We use strictly necessary cookies only: a session cookie for signed-in users and a guest identifier so your projects survive a page reload. No analytics or advertising cookies are set.</p>
      </Section>
      <Section heading="Retention">
        <p>Guest projects and their files are deleted automatically after 30 days of inactivity. Account projects are kept until you delete them or close your account. Billing records are kept as long as tax law requires. Backups roll over within 30 days.</p>
      </Section>
      <Section heading="Your rights">
        <p>You can ask us to export or delete your data, correct your email, or close your account. Residents of the EU, UK and California have additional statutory rights, including the right to complain to a supervisory authority.</p>
      </Section>
      <Section heading="Children">
        <p>Clipmelt is not directed at children under 13 and we do not knowingly collect their data.</p>
      </Section>
      <Section heading="Changes">
        <p>We will post changes here and update the date above. Material changes will be announced in the app.</p>
      </Section>
    </LegalPage>
  );
}
