"use client";

import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import Link from "next/link";
import { Database, Loader2, Plus, UserRound } from "lucide-react";
import type { PublishedIndexDraft, SsiGalleryItem } from "@/lib/index-forge";
import { formatPct } from "@/lib/index-forge";
import { Pill } from "./pill";
import { Button } from "./ui/button";

export function GalleryPage() {
  const [ssiItems, setSsiItems] = useState<SsiGalleryItem[]>([]);
  const [drafts, setDrafts] = useState<PublishedIndexDraft[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;

    async function loadGallery() {
      try {
        const response = await fetch("/api/index-forge/gallery");
        const payload = (await response.json().catch(() => null)) as {
          items?: SsiGalleryItem[];
          message?: string;
        } | null;

        if (!response.ok) {
          throw new Error(payload?.message ?? "Gallery failed to load.");
        }

        if (active) {
          setSsiItems(payload?.items ?? []);
        }
      } catch (requestError) {
        if (active) {
          setError(
            requestError instanceof Error ? requestError.message : "Gallery failed to load."
          );
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    }

    window.requestAnimationFrame(() => {
      if (active) {
        setDrafts(readPublishedDrafts());
      }
    });
    void loadGallery();

    return () => {
      active = false;
    };
  }, []);

  return (
    <main className="relative z-10 bg-background/95 pt-28 backdrop-blur-[2px] md:pt-36">
      <section className="border-y border-border/70 py-14 sm:py-16">
        <div className="container grid gap-8 lg:grid-cols-[0.82fr_1.18fr] lg:gap-16">
          <div>
            <Pill className="mb-5">INDEX GALLERY</Pill>
            <h1 className="font-sentient text-4xl leading-tight sm:text-5xl">
              Live SSI indexes and <i>local drafts</i>
            </h1>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link className="contents" href="/designer">
                <Button>
                  <Plus />
                  [New Index]
                </Button>
              </Link>
              <Link className="contents" href="/creators">
                <Button>
                  <UserRound />
                  [Creators]
                </Button>
              </Link>
            </div>
          </div>

          <div className="space-y-10">
            <GallerySection title="Local IndexForge drafts">
              {drafts.length ? (
                drafts.map((draft) => <DraftRow key={draft.id} draft={draft} />)
              ) : (
                <EmptyRow value="No browser drafts saved yet. Build an index in the designer and save the manifest." />
              )}
            </GallerySection>

            <GallerySection title="SoSoValue Indexes">
              {loading ? (
                <div className="flex items-center gap-3 py-5 font-mono text-xs uppercase text-foreground/45">
                  <Loader2 className="size-4 animate-spin" />
                  Loading live SSI indexes
                </div>
              ) : error ? (
                <EmptyRow value={error} />
              ) : (
                ssiItems.map((item) => <SsiRow key={item.ticker} item={item} />)
              )}
            </GallerySection>
          </div>
        </div>
      </section>
    </main>
  );
}

function GallerySection({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <div className="border-y border-border/70">
      <div className="border-b border-border/70 py-4 font-mono text-xs uppercase tracking-[0.18em] text-foreground/45">
        {title}
      </div>
      <div>{children}</div>
    </div>
  );
}

function DraftRow({ draft }: { draft: PublishedIndexDraft }) {
  return (
    <div className="grid gap-4 border-b border-border/50 py-5 last:border-b-0 sm:grid-cols-[150px_1fr]">
      <div className="font-mono text-xs uppercase text-primary">{draft.ticker}</div>
      <div>
        <div className="font-sentient text-2xl">{draft.indexName}</div>
        <div className="mt-2 flex flex-wrap gap-x-5 gap-y-2 font-mono text-[11px] uppercase text-foreground/45">
          <span>{draft.creator}</span>
          <span>Local draft</span>
          <span>{formatPct(draft.returnPct)} backtest</span>
          <span>{formatPct(draft.maxDrawdownPct)} drawdown</span>
          <span>{draft.manifestId}</span>
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          {draft.constituents.map((item) => (
            <span
              key={`${draft.id}-${item.symbol}`}
              className="border border-border/60 px-2 py-1 font-mono text-[11px] uppercase text-foreground/55"
            >
              {item.symbol} {item.weightPct}%
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

function SsiRow({ item }: { item: SsiGalleryItem }) {
  const holdingGain = item.return1mPct !== null && item.return1mPct > 0;

  return (
    <div className="grid gap-4 border-b border-border/50 py-5 last:border-b-0 sm:grid-cols-[150px_1fr]">
      <div className="flex items-center gap-3 font-mono text-xs uppercase text-primary">
        <Database className="size-4" />
        {item.label}
      </div>
      <div>
        <div className="font-sentient text-2xl">{item.ticker}</div>
        <div className="mt-2 flex flex-wrap gap-x-5 gap-y-2 font-mono text-[11px] uppercase text-foreground/45">
          <span>{item.constituentCount} constituents</span>
          <span>1m {formatOptionalPct(item.return1mPct)}</span>
          <span>3m {formatOptionalPct(item.return3mPct)}</span>
          <span>{holdingGain ? "Gain held" : "No 1m gain"}</span>
        </div>
        <div className="mt-3 font-mono text-[11px] uppercase text-foreground/35">
          {item.matchedSymbols.join(", ") || "Constituents unavailable"}
        </div>
      </div>
    </div>
  );
}

function EmptyRow({ value }: { value: string }) {
  return <div className="py-5 font-mono text-xs uppercase text-foreground/45">{value}</div>;
}

function formatOptionalPct(value: number | null) {
  return value === null ? "--" : formatPct(value);
}

function readPublishedDrafts(): PublishedIndexDraft[] {
  try {
    const parsed = JSON.parse(window.localStorage.getItem("indexforge:published-drafts") ?? "[]");

    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}
