/**
 * Build https://wa.me/... from a phone string. Meta does not offer a public
 * API to verify that a number is registered on WhatsApp.
 */

export function digitsForWhatsApp(
  phone: string | null | undefined,
  defaultCallingCode?: string | null
): string | null {
  if (!phone) return null;
  let d = phone.replace(/\D/g, '');
  if (!d) return null;

  const cc = (defaultCallingCode ?? '').replace(/\D/g, '');
  if (cc && d.length === 10 && !d.startsWith('0')) {
    d = cc + d;
  }

  if (d.length < 8 || d.length > 15) return null;
  return d;
}

export function whatsAppMeHref(
  phone: string | null | undefined,
  defaultCallingCode?: string | null
): string | null {
  const d = digitsForWhatsApp(phone, defaultCallingCode);
  if (!d) return null;
  return `https://wa.me/${d}`;
}
