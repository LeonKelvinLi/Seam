import { COMPANY_NAME, SITE_NAME, SUPPORT_EMAIL } from "@/lib/server/site";

export const LEGAL_UPDATED = "September 6, 2026";

export function LegalPage({ title, intro, children }: { title: string; intro: string; children: React.ReactNode }) {
  return (
    <div className="mx-auto max-w-3xl px-5 pb-20 pt-12">
      <h1 className="display text-4xl">{title}</h1>
      <p className="mt-3 muted">{intro}</p>
      <p className="mt-2 text-sm muted">Last updated {LEGAL_UPDATED}. {SITE_NAME} is operated by {COMPANY_NAME}.</p>
      <div className="legal mt-10 space-y-8 text-[15px] leading-7">{children}</div>
      <p className="mt-12 text-sm muted">Questions? {SUPPORT_EMAIL ? <a className="underline" href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a> : "Contact us through the account page."}</p>
    </div>
  );
}

export function Section({ heading, children }: { heading: string; children: React.ReactNode }) {
  return (<section><h2 className="text-lg font-semibold mb-2">{heading}</h2><div className="space-y-3 muted">{children}</div></section>);
}
