/** Public site facts shared by metadata, legal pages and share links. */
export const SITE_NAME = "SeamCut";
export const COMPANY_NAME = process.env.SEAM_COMPANY_NAME || "BEASTY LLC";
export const SUPPORT_EMAIL = process.env.SEAM_SUPPORT_EMAIL || "";
export const COMPANY_ADDRESS = process.env.SEAM_COMPANY_ADDRESS || "";

export function publicOrigin(): string {
  return (process.env.NEXT_PUBLIC_APP_URL || process.env.SEAM_PUBLIC_URL || "https://seamcut.onrender.com").replace(/\/$/, "");
}
