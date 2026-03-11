"use client";

import { useState } from "react";
import type { GenerateResult } from "@/types";

interface Props {
  result: GenerateResult;
}

export default function OutputSection({ result }: Props) {
  const [copied, setCopied] = useState(false);
  const [researchOpen, setResearchOpen] = useState(false);

  async function handleCopy() {
    await navigator.clipboard.writeText(result.message);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  const sizeLabel: Record<string, string> = {
    large: "Large (5,000+ employees)",
    "mid-large": "Mid-Large (1,000–5,000 employees)",
    mid: "Mid (500–1,000 employees)",
    small: "Small (under 500 employees)",
  };

  return (
    <div id="output-section" className="space-y-4">
      {/* Generated Message */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium bg-purple-600/20 text-purple-400 border border-purple-600/30 rounded-full px-2.5 py-0.5">
              Output
            </span>
            <h2 className="text-white font-semibold text-sm">Generated Outreach Message</h2>
          </div>
          <button
            onClick={handleCopy}
            className={`flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg border transition-all ${
              copied
                ? "bg-emerald-600/20 border-emerald-600/40 text-emerald-400"
                : "bg-slate-800 border-slate-700 text-slate-300 hover:border-slate-500 hover:text-white"
            }`}
          >
            {copied ? (
              <>
                <svg width="12" height="12" viewBox="0 0 12 12" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M2 6l3 3 5-5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
                Copied!
              </>
            ) : (
              <>
                <svg width="12" height="12" viewBox="0 0 12 12" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <rect x="4" y="4" width="7" height="7" rx="1" stroke="currentColor" strokeWidth="1.2"/>
                  <path d="M2.5 8H2a1 1 0 0 1-1-1V2a1 1 0 0 1 1-1h5a1 1 0 0 1 1 1v.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
                </svg>
                Copy to Clipboard
              </>
            )}
          </button>
        </div>

        <div className="bg-slate-800/60 border border-slate-700/60 rounded-xl p-5">
          <p className="text-slate-100 text-sm leading-7 whitespace-pre-wrap">{result.message}</p>
        </div>

        <div className="flex items-center gap-4 text-slate-500 text-xs">
          <span>{result.message.split(/\s+/).filter(Boolean).length} words</span>
          <span>·</span>
          <span>{result.message.length} characters</span>
        </div>
      </div>

      {/* Research Used — collapsible */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden">
        <button
          onClick={() => setResearchOpen((o) => !o)}
          className="w-full flex items-center justify-between px-6 py-4 text-left hover:bg-slate-800/40 transition-colors"
        >
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium bg-slate-700 text-slate-400 rounded-full px-2.5 py-0.5">
              Research
            </span>
            <span className="text-white text-sm font-medium">Research Used</span>
          </div>
          <svg
            width="14"
            height="14"
            viewBox="0 0 14 14"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            className={`text-slate-400 transition-transform duration-200 ${researchOpen ? "rotate-180" : ""}`}
          >
            <path d="M2 5l5 5 5-5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </button>

        {researchOpen && (
          <div className="px-6 pb-6 space-y-5 border-t border-slate-800">
            {/* Company Size */}
            <ResearchBlock
              title="Company Size"
              badge={sizeLabel[result.research.companySizeCategory] ?? result.research.companySizeCategory}
              badgeColor="blue"
            >
              <p className="text-slate-300 text-xs">{result.research.companySize}</p>
            </ResearchBlock>

            {/* Glassdoor / Blind Themes */}
            <ResearchBlock title="Employee Sentiment Themes" badge="Used internally in prompt" badgeColor="amber">
              {result.research.glassdoorThemes.length > 0 ? (
                <ul className="space-y-1">
                  {result.research.glassdoorThemes.map((theme, i) => (
                    <li key={i} className="flex items-start gap-2 text-xs text-slate-300">
                      <span className="text-slate-500 mt-0.5">—</span>
                      {theme}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-slate-500 text-xs">No themes extracted.</p>
              )}
            </ResearchBlock>

            {/* Applied Intuition Facts */}
            <ResearchBlock title="Applied Intuition Facts Used" badge="Pre-seeded + Live" badgeColor="emerald">
              {result.research.appliedIntuitionFacts.length > 0 ? (
                <ul className="space-y-1">
                  {result.research.appliedIntuitionFacts.map((fact, i) => (
                    <li key={i} className="flex items-start gap-2 text-xs text-slate-300">
                      <span className="text-slate-500 mt-0.5">—</span>
                      {fact}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-slate-500 text-xs">No facts extracted.</p>
              )}
            </ResearchBlock>

            {/* CEO / Culture Themes */}
            <ResearchBlock title="Qasar Younis / CEO Culture Themes" badge="YouTube" badgeColor="red">
              {result.research.ceoThemes.length > 0 ? (
                <ul className="space-y-1 mb-3">
                  {result.research.ceoThemes.map((theme, i) => (
                    <li key={i} className="flex items-start gap-2 text-xs text-slate-300">
                      <span className="text-slate-500 mt-0.5">—</span>
                      {theme}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-slate-500 text-xs mb-3">No themes extracted.</p>
              )}
              {result.research.youtubeVideos.length > 0 && (
                <div className="space-y-2">
                  <p className="text-slate-500 text-xs font-medium uppercase tracking-wide">Source Videos</p>
                  {result.research.youtubeVideos.map((video, i) => (
                    <div key={i} className="bg-slate-800 rounded-lg p-3">
                      <p className="text-slate-200 text-xs font-medium">{video.title}</p>
                      {video.description && (
                        <p className="text-slate-500 text-xs mt-1 line-clamp-2">{video.description}</p>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </ResearchBlock>
          </div>
        )}
      </div>
    </div>
  );
}

function ResearchBlock({
  title,
  badge,
  badgeColor,
  children,
}: {
  title: string;
  badge: string;
  badgeColor: "blue" | "amber" | "emerald" | "red";
  children: React.ReactNode;
}) {
  const colors = {
    blue: "bg-blue-600/20 text-blue-400 border-blue-600/30",
    amber: "bg-amber-600/20 text-amber-400 border-amber-600/30",
    emerald: "bg-emerald-600/20 text-emerald-400 border-emerald-600/30",
    red: "bg-red-600/20 text-red-400 border-red-600/30",
  };
  return (
    <div className="pt-4 space-y-2">
      <div className="flex items-center gap-2">
        <h3 className="text-slate-200 text-xs font-semibold">{title}</h3>
        <span className={`text-xs border rounded-full px-2 py-0.5 ${colors[badgeColor]}`}>{badge}</span>
      </div>
      {children}
    </div>
  );
}
