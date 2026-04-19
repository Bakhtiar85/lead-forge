/** Stable key so the same Maps place is not emitted twice under different list titles. */
export function businessDedupeKey(row: {
  name: string | null;
  phone?: string | null;
  website: string | null;
}): string {
  const name = (row.name ?? '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');

  const phone = (row.phone ?? '').replace(/\D/g, '');
  if (row.website) {
    try {
      const u = new URL(row.website);
      const host = u.hostname.toLowerCase().replace(/^www\./, '');
      const path = u.pathname.replace(/\/$/, '') || '/';
      return `url:${host}${path.toLowerCase()}`;
    } catch {
      /* ignore invalid URL */
    }
  }
  if (phone.length >= 7) {
    return `phone:${phone}`;
  }
  return `name:${name}`;
}

export function normalizeListTitle(title: string): string {
  return title.trim().toLowerCase().replace(/\s+/g, ' ');
}
