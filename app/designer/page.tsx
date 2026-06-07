"use client";

import { IndexForgeDashboard } from "@/components/index-forge-dashboard";
import { Leva } from "leva";

export default function DesignerPage() {
  return (
    <>
      <div className="pt-28 md:pt-36" />
      <IndexForgeDashboard />
      <Leva hidden />
    </>
  );
}
