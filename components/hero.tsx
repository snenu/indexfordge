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
        <Pill className="mb-6">WAVE 1 LIVE</Pill>
        <h1 className="text-5xl sm:text-6xl md:text-7xl font-sentient">
          Forge your <br />
          <i className="font-light">on-chain</i> index
        </h1>
        <p className="font-mono text-sm sm:text-base text-foreground/60 text-balance mt-8 max-w-[440px] mx-auto">
          Design, backtest, and publish thematic crypto indexes with live SoSoValue data, AI weighting, SSI Protocol, and SoDEX.
        </p>

        <Link className="contents max-sm:hidden" href="/#composer">
          <Button
            className="mt-14"
            onMouseEnter={() => setHovering(true)}
            onMouseLeave={() => setHovering(false)}
          >
            [Launch Composer]
          </Button>
        </Link>
        <Link className="contents sm:hidden" href="/#composer">
          <Button
            size="sm"
            className="mt-14"
            onMouseEnter={() => setHovering(true)}
            onMouseLeave={() => setHovering(false)}
          >
            [Launch]
          </Button>
        </Link>
      </div>
    </div>
  );
}
