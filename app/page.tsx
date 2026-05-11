'use client'

import { Hero } from "@/components/hero";
import { IndexForgeDashboard } from "@/components/index-forge-dashboard";
import { Leva } from "leva";

export default function Home() {
  return (
    <>
      <Hero />
      <IndexForgeDashboard />
      <Leva hidden />
    </>
  );
}
