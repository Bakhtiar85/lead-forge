'use client';

import { businessDedupeKey } from '@/lib/businessDedupe';
import type { WhatsAppInference } from '@/lib/whatsappPhone';
import { whatsAppMeHref } from '@/lib/whatsappPhone';
import Link from 'next/link';
import React, { useCallback, useEffect, useRef, useState } from 'react';

const WA_DEFAULT_CC = process.env.NEXT_PUBLIC_WHATSAPP_DEFAULT_CALLING_CODE ?? null;

export interface Business {
  name: string;
  rating: number | null;
  ratingLabel?: string | null;
  address: string | null;
  phone: string | null;
  website: string | null;
  email: string | null;
  whatsappHref?: string | null;
  /** Set only after /api/whatsapp-check (headless wa.me); null = not checked yet */
  whatsappOnApp?: WhatsAppInference | null;
}

function formatRating(b: Business): string {
  if (b.rating != null && !Number.isNaN(b.rating)) {
    return b.rating.toFixed(1);
  }
  if (b.ratingLabel) return b.ratingLabel;
  return '—';
}

function hydrateRow(row: Business): Business {
  return {
    ...row,
    email: row.email ?? null,
    whatsappHref: row.whatsappHref ?? whatsAppMeHref(row.phone, WA_DEFAULT_CC) ?? null,
  };
}

function TickCross({
  ok,
  labelYes,
  labelNo,
}: {
  ok: boolean;
  labelYes: string;
  labelNo: string;
}) {
  return (
    <span
      className={`inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-base font-bold leading-none ${
        ok ? 'bg-emerald-500/20 text-emerald-400' : 'bg-red-500/15 text-red-400'
      }`}
      title={ok ? labelYes : labelNo}
      aria-label={ok ? labelYes : labelNo}
    >
      {ok ? '\u2713' : '\u2717'}
    </span>
  );
}

function WhatsAppOnAppBadge({ status }: { status: Business['whatsappOnApp'] }) {
  if (status === 'yes') {
    return (
      <TickCross
        ok
        labelYes="Check: page suggests this number can be messaged on WhatsApp"
        labelNo="Not on WhatsApp"
      />
    );
  }
  if (status === 'no') {
    return (
      <TickCross
        ok={false}
        labelYes="On WhatsApp"
        labelNo="Check: page suggests this number is not on WhatsApp"
      />
    );
  }
  if (status === 'unknown') {
    return (
      <span
        className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-amber-500/15 text-base font-bold leading-none text-amber-300"
        title="Check ran but the page did not show a clear yes or no (cookie wall, layout change, or rate limit)."
        aria-label="WhatsApp presence unclear after check"
      >
        ?
      </span>
    );
  }
  return (
    <span
      className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-700/70 text-base font-semibold leading-none text-slate-400"
      title="Not checked yet — green tick was only meaning a wa.me link could be built, not that WhatsApp is installed for this number."
      aria-label="WhatsApp not checked yet"
    >
      –
    </span>
  );
}

function parseNdjsonLine(line: string): Business {
  const trimmed = line.trim();
  if (!trimmed) {
    throw new Error('Empty line');
  }
  const row = JSON.parse(trimmed) as Business | { error: string };
  if ('error' in row) {
    throw new Error(row.error);
  }
  return row as Business;
}

async function readNdjsonStream(
  response: Response,
  onRow: (row: Business) => void
): Promise<void> {
  const reader = response.body?.getReader();
  if (!reader) {
    throw new Error('No response body');
  }

  const decoder = new TextDecoder();
  let buffer = '';

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';
      for (const line of lines) {
        if (!line.trim()) continue;
        onRow(parseNdjsonLine(line));
      }
    }
  } catch (err) {
    if (!(err instanceof Error && err.name === 'AbortError')) {
      throw err;
    }
  }

  if (buffer.trim()) {
    try {
      onRow(parseNdjsonLine(buffer));
    } catch {
      /* ignore trailing partial JSON when the stream is cut off */
    }
  }
}

const Scrape: React.FC = () => {
  const [city, setCity] = useState('');
  const [businessType, setBusinessType] = useState('');
  const [limit, setLimit] = useState('10');
  const [minRating, setMinRating] = useState('0');
  const [timeLimit, setTimeLimit] = useState('5');
  const [results, setResults] = useState<Business[]>([]);
  const [loading, setLoading] = useState(false);
  const [stoppedByUser, setStoppedByUser] = useState(false);
  const [error, setError] = useState('');
  const abortRef = useRef<AbortController | null>(null);
  const resultsRef = useRef<Business[]>([]);
  const [checkingWa, setCheckingWa] = useState<Set<string>>(() => new Set());
  const [bulkCheckingWa, setBulkCheckingWa] = useState(false);

  useEffect(() => {
    resultsRef.current = results;
  }, [results]);

  const stopScrape = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
  }, []);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    stopScrape();
    const controller = new AbortController();
    abortRef.current = controller;
    setLoading(true);
    setStoppedByUser(false);
    setError('');
    setResults([]);

    const q = new URLSearchParams({
      city,
      businessType,
      limit,
      minRating,
      timeLimit,
    });

    try {
      const response = await fetch(`/api/scrape?${q.toString()}`, {
        signal: controller.signal,
      });

      if (!response.ok) {
        const errBody = await response.json().catch(() => null);
        const msg =
          errBody && typeof errBody === 'object' && 'error' in errBody
            ? String((errBody as { error: string }).error)
            : 'Request failed';
        throw new Error(msg);
      }

      await readNdjsonStream(response, (row) => {
        const hydrated = hydrateRow(row);
        if (!hydrated.phone?.trim()) {
          return;
        }
        setResults((prev) => {
          const k = businessDedupeKey(hydrated);
          if (prev.some((p) => businessDedupeKey(p) === k)) {
            return prev;
          }
          return [...prev, hydrated];
        });
      });
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') {
        setStoppedByUser(true);
      } else {
        setError(err instanceof Error ? err.message : 'Something went wrong');
      }
    } finally {
      setLoading(false);
      abortRef.current = null;
    }

    if (controller.signal.aborted) {
      setStoppedByUser(true);
    }
  };

  const checkWhatsAppRow = useCallback(async (rowKey: string, phone: string) => {
    if (!phone.trim()) return;
    setCheckingWa((prev) => new Set(prev).add(rowKey));
    setError('');
    try {
      const res = await fetch('/api/whatsapp-check', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone }),
      });
      const data = (await res.json()) as {
        status?: WhatsAppInference;
        whatsappHref?: string;
        error?: string;
      };
      if (!res.ok) {
        setError(data.error || 'WhatsApp check failed');
        return;
      }
      setResults((prev) =>
        prev.map((r) =>
          businessDedupeKey(r) === rowKey
            ? {
                ...r,
                whatsappOnApp: data.status ?? 'unknown',
                whatsappHref: data.whatsappHref ?? r.whatsappHref,
              }
            : r
        )
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : 'WhatsApp check failed');
    } finally {
      setCheckingWa((prev) => {
        const next = new Set(prev);
        next.delete(rowKey);
        return next;
      });
    }
  }, []);

  const checkAllWhatsApp = useCallback(async () => {
    const rows = resultsRef.current.filter((b) => b.phone?.trim());
    if (rows.length === 0) return;
    setBulkCheckingWa(true);
    setError('');
    try {
      for (const b of rows) {
        if (b.whatsappOnApp === 'yes') continue;
        const phone = b.phone?.trim();
        if (!phone) continue;
        const key = businessDedupeKey(b);
        await checkWhatsAppRow(key, phone);
        await new Promise((r) => setTimeout(r, 2500));
      }
    } finally {
      setBulkCheckingWa(false);
    }
  }, [checkWhatsAppRow]);

  const handleDownload = () => {
    const downloadData = {
      numberOfRecords: results.length,
      businessType,
      city,
      date: new Date().toISOString(),
      businesses: results,
    };

    const jsonString = JSON.stringify(downloadData, null, 2);
    const blob = new Blob([jsonString], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `business_data_${city}_${businessType}_${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const normalizeUploadedBusiness = (raw: Record<string, unknown>): Business | null => {
    let rating: number | null = null;
    const r = raw.rating;
    if (typeof r === 'number' && !Number.isNaN(r)) {
      rating = r;
    } else if (typeof r === 'string') {
      const m = r.match(/(\d+(?:\.\d+)?)/);
      if (m) {
        const v = parseFloat(m[1]);
        if (!Number.isNaN(v)) rating = v;
      }
    }

    const phoneStr = raw.phone != null ? String(raw.phone).trim() : '';
    if (!phoneStr) {
      return null;
    }

    const emailRaw = raw.email != null ? String(raw.email).trim() : '';
    const email = emailRaw && emailRaw.includes('@') ? emailRaw : null;

    let whatsappOnApp: Business['whatsappOnApp'] = null;
    const waRaw = raw.whatsappOnApp ?? raw.whatsappCheck ?? raw.whatsappRegistered;
    if (waRaw === 'yes' || waRaw === 'no' || waRaw === 'unknown') {
      whatsappOnApp = waRaw;
    }

    return {
      name: String(raw.name ?? ''),
      rating,
      ratingLabel: typeof raw.ratingLabel === 'string' ? raw.ratingLabel : null,
      address: raw.address != null ? String(raw.address) : null,
      phone: phoneStr,
      website: raw.website != null ? String(raw.website) : null,
      email,
      whatsappHref:
        typeof raw.whatsappHref === 'string'
          ? raw.whatsappHref
          : whatsAppMeHref(phoneStr, WA_DEFAULT_CC),
      whatsappOnApp,
    };
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (event) => {
        try {
          const parsedData = JSON.parse(event.target?.result as string) as {
            businesses?: unknown[];
          };
          if (parsedData.businesses && Array.isArray(parsedData.businesses)) {
            const rows = parsedData.businesses
              .map((b) => normalizeUploadedBusiness(b as Record<string, unknown>))
              .filter((b): b is Business => b != null);
            setResults(rows);
            setError('');
          } else {
            setError('Invalid JSON: expected a "businesses" array.');
          }
        } catch {
          setError('Failed to parse JSON file.');
        }
      };
      reader.readAsText(file);
    }
    e.target.value = '';
  };

  const inputClass =
    'w-full rounded-xl border border-slate-600/80 bg-slate-900/60 px-4 py-3 text-slate-100 placeholder:text-slate-500 shadow-inner outline-none ring-0 transition focus:border-amber-400/80 focus:ring-2 focus:ring-amber-400/30';

  const labelClass = 'mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-400';

  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950 text-slate-100">
      <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-amber-500/10 via-transparent to-transparent" />

      <header className="relative z-10 flex shrink-0 items-center justify-between gap-4 border-b border-slate-800/80 bg-slate-950/80 px-4 py-3 backdrop-blur-md sm:px-6">
        <div className="min-w-0">
          <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-amber-400/90 sm:text-xs">
            Lead Forge
          </p>
          <h1 className="truncate text-lg font-bold tracking-tight text-white sm:text-xl">
            Maps lead scraper
          </h1>
        </div>
        <Link
          href="/"
          className="shrink-0 rounded-xl border border-slate-600 px-3 py-2 text-sm font-medium text-slate-200 transition hover:border-slate-500 hover:bg-slate-800/80"
        >
          Home
        </Link>
      </header>

      <main className="relative z-10 flex min-h-0 flex-1 flex-col">
        <section className="shrink-0 border-b border-slate-800 bg-slate-900/60 px-4 py-4 backdrop-blur sm:px-6">
          <form onSubmit={handleSubmit} className="w-full space-y-4">
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 lg:items-end">
              <div className="sm:col-span-1 lg:col-span-1">
                <label className={labelClass} htmlFor="city">
                  City
                </label>
                <input
                  id="city"
                  type="text"
                  placeholder="e.g. Austin, TX"
                  value={city}
                  onChange={(e) => setCity(e.target.value)}
                  required
                  className={inputClass}
                />
              </div>
              <div className="sm:col-span-1 lg:col-span-1">
                <label className={labelClass} htmlFor="business-type">
                  Business type
                </label>
                <input
                  id="business-type"
                  type="text"
                  placeholder="e.g. coffee shops"
                  value={businessType}
                  onChange={(e) => setBusinessType(e.target.value)}
                  required
                  className={inputClass}
                />
              </div>
              <div className="grid grid-cols-3 gap-3 sm:col-span-2 lg:col-span-2">
                <div>
                  <label className={labelClass} htmlFor="data-limit">
                    Max rows
                  </label>
                  <input
                    id="data-limit"
                    type="number"
                    min={1}
                    value={limit}
                    onChange={(e) => setLimit(e.target.value)}
                    required
                    className={inputClass}
                  />
                </div>
                <div>
                  <label className={labelClass} htmlFor="min-rating">
                    Min rating
                  </label>
                  <input
                    id="min-rating"
                    type="number"
                    step="0.1"
                    min={0}
                    max={5}
                    value={minRating}
                    onChange={(e) => setMinRating(e.target.value)}
                    required
                    className={inputClass}
                  />
                </div>
                <div>
                  <label className={labelClass} htmlFor="time-limit">
                    Minutes
                  </label>
                  <input
                    id="time-limit"
                    type="number"
                    min={1}
                    value={timeLimit}
                    onChange={(e) => setTimeLimit(e.target.value)}
                    required
                    className={inputClass}
                  />
                </div>
              </div>
            </div>

            <div className="flex flex-col gap-3 sm:max-w-md sm:flex-row lg:max-w-lg">
              <button
                type="submit"
                disabled={loading}
                className="inline-flex flex-1 items-center justify-center rounded-xl bg-amber-500 px-4 py-3 text-sm font-semibold text-slate-950 shadow-lg shadow-amber-500/25 transition hover:bg-amber-400 disabled:cursor-not-allowed disabled:bg-slate-600 disabled:text-slate-300 disabled:shadow-none"
              >
                {loading ? 'Scraping…' : 'Start scrape'}
              </button>
              <button
                type="button"
                onClick={stopScrape}
                disabled={!loading}
                className="inline-flex flex-1 items-center justify-center rounded-xl border border-slate-600 bg-slate-800/50 px-4 py-3 text-sm font-semibold text-slate-200 transition hover:border-red-400/50 hover:bg-red-950/40 hover:text-red-100 disabled:cursor-not-allowed disabled:opacity-40"
              >
                Stop
              </button>
            </div>
          </form>

          {error && (
            <div className="mt-4 rounded-xl border border-red-500/40 bg-red-950/40 px-4 py-3 text-sm text-red-200">
              {error}
            </div>
          )}
          {stoppedByUser && !error && (
            <div className="mt-4 rounded-xl border border-amber-500/30 bg-amber-950/30 px-4 py-3 text-sm text-amber-100">
              Stopped. Kept {results.length} row{results.length === 1 ? '' : 's'} collected so far.
            </div>
          )}
        </section>

        <section className="flex min-h-0 flex-1 flex-col bg-slate-900/30">
          <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-b border-slate-800 px-4 py-3 sm:px-6">
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-semibold text-white">Results</h2>
                <p className="text-sm text-slate-400">
                  {results.length} lead{results.length === 1 ? '' : 's'} (phone required)
                  {loading ? ' · still running…' : ''}
                </p>
              </div>

              <p className="mt-1 max-w-6xl text-xs text-slate-500">
                Entries without a phone number are skipped. WhatsApp: <strong className="text-slate-400">–</strong>{' '}
                means not checked yet; use <strong className="text-slate-400">Check</strong> or{' '}
                <strong className="text-slate-400">Check all WA</strong> to load the public{' '}
                <code className="text-slate-400">wa.me</code> page in a headless browser — then ✓ / ✗ / ? reflect
                best-effort text on that page (not an official Meta API, can be wrong). Email comes from Maps when
                shown. For 10-digit numbers set{' '}
                <code className="text-slate-400">NEXT_PUBLIC_WHATSAPP_DEFAULT_CALLING_CODE</code> and{' '}
                <code className="text-slate-400">WHATSAPP_DEFAULT_CALLING_CODE</code> (e.g.{' '}
                <code className="text-slate-400">1</code>).
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <label className="cursor-pointer rounded-xl border border-slate-600 px-3 py-2 text-sm font-medium text-slate-200 transition hover:border-slate-500 hover:bg-slate-800/80">
                Import JSON
                <input
                  type="file"
                  accept=".json,application/json"
                  className="sr-only"
                  onChange={handleFileUpload}
                />
              </label>
              <button
                type="button"
                onClick={() => void checkAllWhatsApp()}
                disabled={results.length === 0 || bulkCheckingWa || loading}
                className="rounded-xl border border-emerald-600/50 bg-emerald-950/40 px-3 py-2 text-sm font-semibold text-emerald-200 transition hover:bg-emerald-900/50 disabled:cursor-not-allowed disabled:opacity-40"
              >
                {bulkCheckingWa ? 'Checking WA…' : 'Check all WA'}
              </button>
              <button
                type="button"
                onClick={handleDownload}
                disabled={results.length === 0}
                className="rounded-xl border border-amber-500/50 bg-amber-500/10 px-3 py-2 text-sm font-semibold text-amber-200 transition hover:bg-amber-500/20 disabled:cursor-not-allowed disabled:opacity-40"
              >
                Download
              </button>
            </div>
          </div>

          <div className="min-h-0 flex-1 overflow-auto">
            <table className="w-full min-w-[1180px] table-auto divide-y divide-slate-800 text-left text-sm">
              <thead className="sticky top-0 z-10 border-b border-slate-800 bg-slate-950/95 text-xs uppercase tracking-wide text-slate-500 backdrop-blur-sm">
                <tr>
                  <th className="whitespace-nowrap px-4 py-3 sm:px-6">#</th>
                  <th className="whitespace-nowrap px-4 py-3 sm:px-6">Name</th>
                  <th className="whitespace-nowrap px-4 py-3 sm:px-6">Rating</th>
                  <th className="min-w-[11rem] whitespace-nowrap px-4 py-3 sm:px-6">Website</th>
                  <th className="whitespace-nowrap px-4 py-3 sm:px-6">Phone</th>
                  <th className="whitespace-nowrap px-4 py-3 sm:px-6">WhatsApp</th>
                  <th className="min-w-[10rem] px-4 py-3 sm:px-6">Email</th>
                  <th className="min-w-[12rem] px-4 py-3 sm:px-6">Address</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/80">
                {results.length === 0 && !loading && (
                  <tr>
                    <td
                      colSpan={8}
                      className="px-4 py-12 text-center text-slate-500 sm:px-6"
                    >
                      Run a search to see leads here. Rows appear as they are scraped.
                    </td>
                  </tr>
                )}
                {results.map((business, index) => {
                  const rowKey = businessDedupeKey(business);
                  const waHref =
                    business.whatsappHref ?? whatsAppMeHref(business.phone, WA_DEFAULT_CC);
                  const waChecked = business.whatsappOnApp != null;
                  const rowChecking = checkingWa.has(rowKey);
                  const phoneStr = business.phone?.trim() ?? '';
                  const email = business.email?.trim() || null;
                  const emailOk = Boolean(email);
                  return (
                    <tr
                      key={rowKey}
                      className="bg-slate-900/20 transition hover:bg-slate-800/40"
                    >
                      <td className="whitespace-nowrap px-4 py-3 text-slate-500 sm:px-6">
                        {index + 1}
                      </td>
                      <td className="max-w-[min(28vw,20rem)] truncate px-4 py-3 font-medium text-white sm:px-6">
                        {business.name}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 sm:px-6">
                        <span className="inline-flex items-center gap-1.5 rounded-lg bg-slate-800/80 px-2.5 py-1 font-medium tabular-nums text-amber-300">
                          <span aria-hidden>★</span>
                          {formatRating(business)}
                        </span>
                      </td>
                      <td className="max-w-md truncate px-4 py-3 sm:px-6">
                        {business.website ? (
                          <a
                            href={business.website}
                            className="text-amber-400/90 underline-offset-2 hover:underline"
                            target="_blank"
                            rel="noreferrer"
                          >
                            {business.website}
                          </a>
                        ) : (
                          <span className="text-slate-500">—</span>
                        )}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-slate-300 sm:px-6">
                        {business.phone}
                      </td>
                      <td className="px-4 py-3 sm:px-6">
                        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
                          <div className="flex items-center gap-3">
                            <WhatsAppOnAppBadge status={business.whatsappOnApp ?? null} />
                            {waHref ? (
                              <a
                                href={waHref}
                                target="_blank"
                                rel="noreferrer"
                                className="text-sm font-medium text-emerald-400/95 underline-offset-2 hover:underline"
                              >
                                Chat
                              </a>
                            ) : (
                              <span className="text-xs text-slate-500">No wa.me link</span>
                            )}
                          </div>
                          {phoneStr ? (
                            <button
                              type="button"
                              onClick={() => void checkWhatsAppRow(rowKey, phoneStr)}
                              disabled={rowChecking || bulkCheckingWa}
                              className="w-fit rounded-lg border border-slate-600 px-2 py-1 text-xs font-medium text-slate-200 transition hover:border-emerald-500/50 hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
                            >
                              {rowChecking ? 'Checking…' : waChecked ? 'Re-check' : 'Check'}
                            </button>
                          ) : null}
                        </div>
                      </td>
                      <td className="max-w-[14rem] px-4 py-3 sm:px-6">
                        <div className="flex items-start gap-3">
                          <TickCross
                            ok={emailOk}
                            labelYes="Email found on listing"
                            labelNo="No email on listing"
                          />
                          {email ? (
                            <a
                              href={`mailto:${email}`}
                              className="min-w-0 break-all text-sm text-sky-300 underline-offset-2 hover:underline"
                            >
                              {email}
                            </a>
                          ) : (
                            <span className="text-xs text-slate-500">—</span>
                          )}
                        </div>
                      </td>
                      <td className="max-w-xl truncate px-4 py-3 text-slate-300 sm:px-6">
                        {business.address || <span className="text-slate-500">—</span>}
                      </td>
                    </tr>
                  );
                })}
                {loading && results.length === 0 && (
                  <tr>
                    <td
                      colSpan={8}
                      className="px-4 py-8 text-center text-slate-500 sm:px-6"
                    >
                      Waiting for first result…
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      </main>
    </div>
  );
};

export default Scrape;
