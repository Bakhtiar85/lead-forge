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

export type WhatsAppInference = 'yes' | 'no' | 'unknown';

/**
 * Best-effort parse of WhatsApp web / wa.me content. Not from Meta; can be wrong
 * (locale, A/B UI, cookie walls). Prefer "no" when clear error strings appear.
 */
export function inferWhatsAppFromWaPage(visibleText: string, html: string): WhatsAppInference {
  const t = `${visibleText}\n${html}`
    .toLowerCase()
    .replace(/\r\n/g, '\n')
    .replace(/\u2019/g, "'")
    .replace(/\u2018/g, "'")
    .replace(/\u00a0/g, ' ');

  const definiteNo = [
    "isn't on whatsapp",
    'is not on whatsapp',
    'not on whatsapp',
    "isn't a whatsapp user",
    'is not a whatsapp user',
    'not a whatsapp user',
    'not registered on whatsapp',
    'no whatsapp account',
    'no account on whatsapp',
    "couldn't find",
    'could not find',
    'phone number is invalid',
    'invalid phone number',
    'invalid phone',
    'invalid number',
    'number is invalid',
    "can't message",
    'cannot message',
    'cannot send message',
    'unable to send',
    'wrong phone',
    'wrong number',
    'não está no whatsapp',
    'nao esta no whatsapp',
    'no está en whatsapp',
    'no tiene whatsapp',
    'no utiliza whatsapp',
    'numéro invalide',
    'numero invalido',
    'número inválido',
    'numero non valido',
    'hat kein whatsapp',
    'nicht bei whatsapp',
    'whatsapp nicht gefunden',
    'kein whatsapp',
    'pas sur whatsapp',
    'non disponible sur whatsapp',
    'non è su whatsapp',
    'non è registrato',
    'link is invalid',
    'link invalid',
    'invalid link',
    'this link is invalid',
  ];

  for (const phrase of definiteNo) {
    if (t.includes(phrase)) {
      return 'no';
    }
  }

  const definiteYes = [
    'continue to whatsapp',
    'continue to chat',
    'continue on whatsapp',
    'open whatsapp',
    'chat on whatsapp',
    'use whatsapp',
    'send message to',
    'message to',
    'use the following link to open whatsapp',
    'continuar para o whatsapp',
    'continuar al chat',
  ];

  for (const phrase of definiteYes) {
    if (t.includes(phrase)) {
      return 'yes';
    }
  }

  return 'unknown';
}
