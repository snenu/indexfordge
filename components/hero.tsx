"use client";

import Link from "next/link";
import { GL } from "./gl";
import { Pill } from "./pill";
import { Button } from "./ui/button";
import { useState } from "react";

export function Hero() {
  const [hovering, setHovering] = useState(false);
  return (
    <div className="relative flex min-h-[86svh] flex-col justify-between">
      <GL hovering={hovering} />

      <div className="relative mt-auto pb-12 text-center sm:pb-16">
        <Pill className="mb-6">LIVE COMPOSER</Pill>
        <h1 className="text-5xl sm:text-6xl md:text-7xl font-sentient">
          Forge your <br />
          <i className="font-light">on-chain</i> index
        </h1>
        <p className="font-mono text-sm sm:text-base text-foreground/60 text-balance mt-8 max-w-[440px] mx-auto">
          Design, backtest, and prepare thematic crypto indexes with live SoSoValue data, transparent weighting, SSI references, and SoDEX execution intents.
        </p>

        <div className="mt-14 flex flex-wrap justify-center gap-3">
          <Link className="contents max-sm:hidden" href="/designer">
            <Button
              onMouseEnter={() => setHovering(true)}
              onMouseLeave={() => setHovering(false)}
            >
              [Launch Designer]
            </Button>
          </Link>
          <Link className="contents max-sm:hidden" href="/gallery">
            <Button
              onMouseEnter={() => setHovering(true)}
              onMouseLeave={() => setHovering(false)}
            >
              [View Gallery]
            </Button>
          </Link>
          <Link className="contents sm:hidden" href="/designer">
            <Button
              size="sm"
              onMouseEnter={() => setHovering(true)}
              onMouseLeave={() => setHovering(false)}
            >
              [Launch]
            </Button>
          </Link>
        </div>
      </div>
    </div>
  );
}
