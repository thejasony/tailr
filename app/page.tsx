"use client";

import { useState } from "react";
import ProfileForm from "@/components/ProfileForm";
import OutputSection from "@/components/OutputSection";
import type { GenerateResult } from "@/types";

export default function Home() {
  const [result, setResult] = useState<GenerateResult | null>(null);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950">
      {/* Header */}
      <header className="border-b border-slate-800 bg-slate-950/80 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-4xl mx-auto px-6 py-4 flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-blue-600 flex items-center justify-center flex-shrink-0">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M2 12L6 8L9 11L13 6" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
              <circle cx="13" cy="4" r="1.5" fill="white"/>
            </svg>
          </div>
          <div>
            <h1 className="text-white font-semibold text-base leading-tight">Tailr</h1>
            <p className="text-slate-400 text-xs">Personalized Outreach</p>
          </div>
        </div>
      </header>

      {/* Main content */}
      <main className="max-w-4xl mx-auto px-6 py-10 space-y-10">
        <ProfileForm onResult={setResult} />
        {result && <OutputSection result={result} />}
      </main>
    </div>
  );
}
