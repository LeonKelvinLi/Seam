/** Public site facts shared by metadata, legal pages and share links. */
export const SITE_NAME = "Clipmelt";

export function legalContact() {
  return {
    companyName: process.env.SEAM_COMPANY_NAME?.trim() || "BEASTY LLC",
    supportEmail: process.env.SEAM_SUPPORT_EMAIL?.trim() || "",
    companyAddress: process.env.SEAM_COMPANY_ADDRESS?.trim() || "",
  };
}

export function publicOrigin(): string {
  return (process.env.NEXT_PUBLIC_APP_URL || process.env.SEAM_PUBLIC_URL || "https://seamcut.onrender.com").replace(/\/$/, "");
}
