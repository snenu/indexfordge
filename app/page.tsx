'use client'

import { Hero } from "@/components/hero";
import { HomeProof } from "@/components/home-proof";
import { Leva } from "leva";

export default function Home() {
  return (
    <>
      <Hero />
      <HomeProof />
      <Leva hidden />
    </>
  );
}
