import Link from "next/link";
import { ArrowUpRight, Database, LineChart, SlidersHorizontal } from "lucide-react";
import type { ReactNode } from "react";
import { Pill } from "./pill";

export function HomeProof() {
  return (
    <main className="relative z-10 border-y border-border/70 bg-background/95 py-14 backdrop-blur-[2px] sm:py-16">
      <div className="container grid gap-8 lg:grid-cols-[0.82fr_1.18fr] lg:gap-16">
        <div>
          <Pill className="mb-5">WAVE 2 PRODUCT</Pill>
          <h2 className="font-sentient text-4xl leading-tight sm:text-5xl">
            Build, validate, publish <i>drafts</i>
          </h2>
        </div>
        <div className="grid gap-0 border-y border-border/70">
          <HomeRow
            icon={<SlidersHorizontal />}
            label="Designer"
            href="/designer"
            value="Theme input, live token universe, manual weight sliders, and rerunnable backtests."
          />
          <HomeRow
            icon={<LineChart />}
            label="Validation"
            href="/designer"
            value="Risk metrics, holdout checks, rebalance count, assumptions, and overfit controls."
          />
          <HomeRow
            icon={<Database />}
            label="Gallery"
            href="/gallery"
            value="Live SoSoValue Indexes plus browser-saved IndexForge draft manifests."
          />
          <HomeRow
            icon={<ArrowUpRight />}
            label="Creators"
            href="/creators"
            value="Creator profiles grouped from local drafts, ready for backend persistence."
          />
        </div>
      </div>
    </main>
  );
}

function HomeRow({
  icon,
  label,
  value,
  href,
}: {
  icon: ReactNode;
  label: string;
  value: string;
  href: string;
}) {
  return (
    <Link
      href={href}
      className="grid gap-4 border-b border-border/70 py-5 transition-colors hover:text-primary last:border-b-0 sm:grid-cols-[160px_1fr]"
    >
      <div className="flex items-center gap-3 font-mono text-xs uppercase text-primary">
        {icon}
        <span>{label}</span>
      </div>
      <div className="text-lg text-foreground/70">{value}</div>
    </Link>
  );
}
