import Link from 'next/link';

export default function Home() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950 px-6 text-center text-slate-100">
      <p className="text-xs font-semibold uppercase tracking-[0.25em] text-amber-400/90">
        Lead Forge
      </p>
      <h1 className="mt-3 text-3xl font-bold tracking-tight text-white sm:text-4xl">
        Maps business leads
      </h1>
      <p className="mt-4 max-w-md text-sm text-slate-400">
        Scrape Google Maps listings into a clean table, stream results while the job runs, and export
        JSON when you are done.
      </p>
      <Link
        href="/scrape"
        className="mt-8 inline-flex items-center justify-center rounded-xl bg-amber-500 px-6 py-3 text-sm font-semibold text-slate-950 shadow-lg shadow-amber-500/25 transition hover:bg-amber-400"
      >
        Open scraper
      </Link>
    </div>
  );
}
