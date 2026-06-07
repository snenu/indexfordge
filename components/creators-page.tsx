"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Plus, UserRound } from "lucide-react";
import type { PublishedIndexDraft } from "@/lib/index-forge";
import { formatPct } from "@/lib/index-forge";
import { Pill } from "./pill";
import { Button } from "./ui/button";

export function CreatorsPage() {
  const [drafts, setDrafts] = useState<PublishedIndexDraft[]>([]);
  const creators = useMemo(() => groupByCreator(drafts), [drafts]);

  useEffect(() => {
    let active = true;

    window.requestAnimationFrame(() => {
      if (active) {
        setDrafts(readPublishedDrafts());
      }
    });

    return () => {
      active = false;
    };
  }, []);

  return (
    <main className="relative z-10 bg-background/95 pt-28 backdrop-blur-[2px] md:pt-36">
      <section className="border-y border-border/70 py-14 sm:py-16">
        <div className="container grid gap-8 lg:grid-cols-[0.82fr_1.18fr] lg:gap-16">
          <div>
            <Pill className="mb-5">CREATOR PROFILES</Pill>
            <h1 className="font-sentient text-4xl leading-tight sm:text-5xl">
              Index creators and <i>local work</i>
            </h1>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link className="contents" href="/designer">
                <Button>
                  <Plus />
                  [Create Index]
                </Button>
              </Link>
              <Link className="contents" href="/gallery">
                <Button>
                  <UserRound />
                  [Gallery]
                </Button>
              </Link>
            </div>
          </div>

          <div className="border-y border-border/70">
            {creators.length ? (
              creators.map((creator) => <CreatorRow key={creator.name} creator={creator} />)
            ) : (
              <div className="py-5 font-mono text-xs uppercase text-foreground/45">
                No creator profiles yet. Save a draft from the designer to create one in this browser.
              </div>
            )}
          </div>
        </div>
      </section>
    </main>
  );
}

function CreatorRow({
  creator,
}: {
  creator: {
    name: string;
    drafts: PublishedIndexDraft[];
    bestReturnPct: number;
    averageDrawdownPct: number;
  };
}) {
  return (
    <div className="grid gap-4 border-b border-border/50 py-5 last:border-b-0 sm:grid-cols-[170px_1fr]">
      <div className="flex items-center gap-3 font-mono text-xs uppercase text-primary">
        <UserRound className="size-4" />
        {creator.name}
      </div>
      <div>
        <div className="flex flex-wrap gap-x-5 gap-y-2 font-mono text-[11px] uppercase text-foreground/45">
          <span>{creator.drafts.length} indexes</span>
          <span>Browser saved</span>
          <span>Best {formatPct(creator.bestReturnPct)}</span>
          <span>Avg drawdown {formatPct(creator.averageDrawdownPct)}</span>
        </div>
        <div className="mt-4 grid gap-3">
          {creator.drafts.map((draft) => (
            <div
              key={draft.id}
              className="grid gap-2 border-t border-border/35 pt-3 sm:grid-cols-[110px_1fr_110px]"
            >
              <span className="font-mono text-xs uppercase text-foreground">{draft.ticker}</span>
              <span className="font-mono text-[11px] uppercase text-foreground/45">
                {draft.indexName} / {draft.manifestId}
              </span>
              <span className="font-mono text-[11px] uppercase text-primary">
                {formatPct(draft.returnPct)}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function groupByCreator(drafts: PublishedIndexDraft[]) {
  const byCreator = new Map<string, PublishedIndexDraft[]>();

  drafts.forEach((draft) => {
    const key = draft.creator.trim();

    if (!key) return;

    byCreator.set(key, [...(byCreator.get(key) ?? []), draft]);
  });

  return Array.from(byCreator.entries())
    .map(([name, items]) => ({
      name,
      drafts: items,
      bestReturnPct: Math.max(...items.map((item) => item.returnPct)),
      averageDrawdownPct:
        items.reduce((sum, item) => sum + item.maxDrawdownPct, 0) / items.length,
    }))
    .sort((a, b) => b.bestReturnPct - a.bestReturnPct);
}

function readPublishedDrafts(): PublishedIndexDraft[] {
  try {
    const parsed = JSON.parse(window.localStorage.getItem("indexforge:published-drafts") ?? "[]");

    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}
