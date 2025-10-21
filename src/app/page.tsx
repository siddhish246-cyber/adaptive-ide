"use client";
import dynamic from "next/dynamic";

const AdaptiveIDEPro = dynamic(() => import("@/components/AdaptiveIDEPro"), { ssr: false });

export default function Page() {
  return (
    <main className="min-h-screen">
      <AdaptiveIDEPro />
    </main>
  );
}
