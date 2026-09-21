import Link from "next/link";
import { ArrowUpRight, ChefHat, QrCode } from "lucide-react";

export default function Home() {
  return (
    <main className="min-h-screen bg-[var(--paper)] px-5 py-8 text-[var(--ink)] sm:px-10 sm:py-12">
      <div className="mx-auto max-w-6xl">
        <div className="mb-16 flex items-center justify-between">
          <div>
            <p className="font-display text-2xl font-semibold">Ember &amp; Oak</p>
            <p className="text-sm text-[var(--muted-ink)]">Cafe ordering system</p>
          </div>
          <span className="demo-badge">Demo Mode</span>
        </div>

        <section className="grid items-end gap-10 lg:grid-cols-[1.15fr_0.85fr]">
          <div>
            <p className="mb-4 text-sm font-bold uppercase tracking-[0.2em] text-[var(--accent)]">Interactive presentation</p>
            <h1 className="font-display max-w-3xl text-5xl font-semibold leading-[0.98] tracking-[-0.04em] sm:text-7xl">
              From table to kitchen, in one smooth flow.
            </h1>
            <p className="mt-6 max-w-xl text-lg leading-8 text-[var(--muted-ink)]">
              Open both views in separate tabs to demonstrate ordering, live status updates, service calls and table closure.
            </p>
          </div>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-1">
            <Link className="launch-card group" href="/table/demo-table-1">
              <span className="launch-icon"><QrCode size={24} /></span>
              <span>
                <strong>Customer ordering</strong>
                <small>Table 1 mobile experience</small>
              </span>
              <ArrowUpRight className="ml-auto transition-transform group-hover:-translate-y-1 group-hover:translate-x-1" />
            </Link>
            <Link className="launch-card group bg-[var(--ink)] text-white" href="/kitchen">
              <span className="launch-icon border-white/15 bg-white/10"><ChefHat size={24} /></span>
              <span>
                <strong>Kitchen dashboard</strong>
                <small className="text-white/60">Six-table operations view</small>
              </span>
              <ArrowUpRight className="ml-auto transition-transform group-hover:-translate-y-1 group-hover:translate-x-1" />
            </Link>
          </div>
        </section>
      </div>
    </main>
  );
}
