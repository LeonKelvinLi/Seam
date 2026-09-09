import { connection } from "next/server";
import { legalContact, SITE_NAME } from "@/lib/server/site";

export const LEGAL_UPDATED = "September 9, 2026";

export async function LegalPage({ title, intro, children }: { title: string; intro: string; children: React.ReactNode }) {
  await connection();
  const { companyName, companyAddress, supportEmail } = legalContact();
  return (
    <div className="mx-auto max-w-3xl px-5 pb-20 pt-12">
      <h1 className="display text-4xl">{title}</h1>
      <p className="mt-3 muted">{intro}</p>
      <p className="mt-2 text-sm muted">Last updated {LEGAL_UPDATED}. {SITE_NAME} is operated by {companyName}{companyAddress ? `, ${companyAddress}` : ""}.</p>
      <div className="legal mt-10 space-y-8 text-[15px] leading-7">{children}</div>
      <p className="mt-12 text-sm muted">Questions? {supportEmail ? <a className="underline" href={`mailto:${supportEmail}`}>{supportEmail}</a> : "Contact us through the account page."}</p>
    </div>
  );
}

export function Section({ heading, children }: { heading: string; children: React.ReactNode }) {
  return (<section><h2 className="text-lg font-semibold mb-2">{heading}</h2><div className="space-y-3 muted">{children}</div></section>);
}
