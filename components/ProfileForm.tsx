"use client";

import { useState } from "react";
import type { ParsedProfile, LocationOption, GenerateResult } from "@/types";

interface Props {
  onResult: (result: GenerateResult) => void;
}

const VAGUE_LOCATIONS = ["united states", "us", "usa", "canada", "remote", "worldwide", "global", "north america"];
const VAGUE_COMPANIES = ["company", "confidential", "n/a", "", "not specified"];

function isVagueLocation(loc: string) {
  return VAGUE_LOCATIONS.includes(loc.toLowerCase().trim());
}

function isVagueCompany(company: string) {
  return VAGUE_COMPANIES.includes(company.toLowerCase().trim()) || company.trim().length < 2;
}

function isVagueField(field: string, value: string) {
  if (field === "currentLocation") return isVagueLocation(value);
  if (field === "currentCompany") return isVagueCompany(value);
  return value.trim().length < 2;
}

export default function ProfileForm({ onResult }: Props) {
  const [linkedinText, setLinkedinText] = useState("");
  const [profile, setProfile] = useState<ParsedProfile | null>(null);
  const [locationOption, setLocationOption] = useState<LocationOption>("exclude");
  const [isParsing, setIsParsing] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [parseError, setParseError] = useState("");
  const [generateError, setGenerateError] = useState("");

  async function handleParse() {
    if (!linkedinText.trim()) return;
    setIsParsing(true);
    setParseError("");
    setProfile(null);
    try {
      const res = await fetch("/api/parse-profile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: linkedinText }),
      });
      if (!res.ok) throw new Error("Failed to parse profile");
      const data = await res.json();
      setProfile(data);
    } catch (e) {
      setParseError("Could not parse the profile. Please check your OpenAI API key and try again.");
    } finally {
      setIsParsing(false);
    }
  }

  async function handleGenerate() {
    if (!profile) return;
    setIsGenerating(true);
    setGenerateError("");
    try {
      const res = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ profile, locationOption }),
      });
      if (!res.ok) throw new Error("Generation failed");
      const data = await res.json();
      onResult(data);
      // Scroll to output
      setTimeout(() => {
        document.getElementById("output-section")?.scrollIntoView({ behavior: "smooth" });
      }, 100);
    } catch (e) {
      setGenerateError("Message generation failed. Please check your API keys and try again.");
    } finally {
      setIsGenerating(false);
    }
  }

  function updateField(key: keyof ParsedProfile, value: string) {
    if (!profile) return;
    setProfile({ ...profile, [key]: value });
  }

  const locationVague = profile ? isVagueLocation(profile.currentLocation) : false;

  return (
    <div className="space-y-6">
      {/* Step 1 — Paste LinkedIn Text */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-4">
        <div className="flex items-center gap-2 mb-1">
          <span className="text-xs font-medium bg-blue-600/20 text-blue-400 border border-blue-600/30 rounded-full px-2.5 py-0.5">
            Step 1
          </span>
          <h2 className="text-white font-semibold text-sm">Paste LinkedIn Profile</h2>
        </div>
        <p className="text-slate-400 text-xs leading-relaxed">
          Open the candidate&apos;s LinkedIn profile, select all text on the page (Cmd+A), copy it, and paste it below.
        </p>
        <textarea
          className="w-full h-44 bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-slate-200 text-sm placeholder-slate-500 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 resize-none transition-colors"
          placeholder="Paste the full text from a LinkedIn profile page here..."
          value={linkedinText}
          onChange={(e) => setLinkedinText(e.target.value)}
        />
        {parseError && (
          <p className="text-red-400 text-xs">{parseError}</p>
        )}
        <button
          onClick={handleParse}
          disabled={!linkedinText.trim() || isParsing}
          className="flex items-center gap-2 bg-slate-700 hover:bg-slate-600 disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-medium px-4 py-2.5 rounded-xl transition-colors"
        >
          {isParsing ? (
            <>
              <Spinner />
              Parsing with AI...
            </>
          ) : (
            <>
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M1 7h12M7 1l6 6-6 6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
              Parse Profile
            </>
          )}
        </button>
      </div>

      {/* Step 2 — Parsed Fields */}
      {profile && (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-5">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xs font-medium bg-emerald-600/20 text-emerald-400 border border-emerald-600/30 rounded-full px-2.5 py-0.5">
              Step 2
            </span>
            <h2 className="text-white font-semibold text-sm">Review Extracted Profile</h2>
          </div>
          <p className="text-slate-400 text-xs">
            Verify and edit these fields before generating the message.
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <ProfileField
              label="Full Name"
              fieldKey="fullName"
              value={profile.fullName}
              onChange={(v) => updateField("fullName", v)}
            />
            <ProfileField
              label="Current Title"
              fieldKey="currentTitle"
              value={profile.currentTitle}
              onChange={(v) => updateField("currentTitle", v)}
            />
            <ProfileField
              label="Current Company"
              fieldKey="currentCompany"
              value={profile.currentCompany}
              onChange={(v) => updateField("currentCompany", v)}
              vague={isVagueCompany(profile.currentCompany)}
              vagueMsg="Company name looks unclear — please verify."
            />
            <ProfileField
              label="Location"
              fieldKey="currentLocation"
              value={profile.currentLocation}
              onChange={(v) => updateField("currentLocation", v)}
              vague={locationVague}
              vagueMsg="Location is vague — select how to handle it below."
            />
          </div>

          {/* Location handling options */}
          {locationVague && (
            <div className="bg-amber-950/30 border border-amber-700/40 rounded-xl p-4 space-y-3">
              <p className="text-amber-300 text-xs font-medium">How should we handle the vague location?</p>
              <label className="flex items-start gap-3 cursor-pointer group">
                <input
                  type="radio"
                  name="locationOption"
                  value="exclude"
                  checked={locationOption === "exclude"}
                  onChange={() => setLocationOption("exclude")}
                  className="mt-0.5 accent-blue-500"
                />
                <span className="text-slate-300 text-xs leading-relaxed">
                  <span className="font-medium text-slate-200">Exclude location references</span> from the message entirely.
                </span>
              </label>
              <label className="flex items-start gap-3 cursor-pointer group">
                <input
                  type="radio"
                  name="locationOption"
                  value="include_disclaimer"
                  checked={locationOption === "include_disclaimer"}
                  onChange={() => setLocationOption("include_disclaimer")}
                  className="mt-0.5 accent-blue-500"
                />
                <span className="text-slate-300 text-xs leading-relaxed">
                  <span className="font-medium text-slate-200">Include a transparent disclaimer:</span>{" "}
                  &ldquo;I couldn&apos;t find your exact location from LinkedIn, but this role is based in Sunnyvale, CA — wanted to be upfront about that.&rdquo;
                </span>
              </label>
            </div>
          )}

          {/* Generate button */}
          <div className="pt-2">
            {generateError && (
              <p className="text-red-400 text-xs mb-3">{generateError}</p>
            )}
            <button
              onClick={handleGenerate}
              disabled={isGenerating}
              className="w-full flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold text-sm px-6 py-3 rounded-xl transition-colors"
            >
              {isGenerating ? (
                <>
                  <Spinner />
                  Researching & generating...
                </>
              ) : (
                <>
                  <svg width="15" height="15" viewBox="0 0 15 15" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M7.5 1v13M1 7.5h13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                  </svg>
                  Generate Outreach Message
                </>
              )}
            </button>
            {isGenerating && (
              <p className="text-slate-500 text-xs text-center mt-2">
                Running parallel research (Glassdoor sentiment, company size, AI news, CEO videos)...
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function ProfileField({
  label,
  value,
  onChange,
  vague,
  vagueMsg,
}: {
  label: string;
  fieldKey: string;
  value: string;
  onChange: (v: string) => void;
  vague?: boolean;
  vagueMsg?: string;
}) {
  return (
    <div className="space-y-1.5">
      <label className="text-slate-400 text-xs font-medium">{label}</label>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={`w-full bg-slate-800 border rounded-lg px-3 py-2.5 text-sm text-slate-100 focus:outline-none focus:ring-1 transition-colors ${
          vague
            ? "border-amber-500/60 bg-amber-950/20 focus:border-amber-400 focus:ring-amber-400/30"
            : "border-slate-700 focus:border-blue-500 focus:ring-blue-500"
        }`}
      />
      {vague && vagueMsg && (
        <p className="text-amber-400 text-xs flex items-center gap-1">
          <svg width="11" height="11" viewBox="0 0 11 11" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M5.5 1L10 9.5H1L5.5 1Z" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round"/>
            <path d="M5.5 4.5v2" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
            <circle cx="5.5" cy="7.5" r="0.5" fill="currentColor"/>
          </svg>
          {vagueMsg}
        </p>
      )}
    </div>
  );
}

function Spinner() {
  return (
    <svg className="animate-spin" width="14" height="14" viewBox="0 0 14 14" fill="none" xmlns="http://www.w3.org/2000/svg">
      <circle cx="7" cy="7" r="5.5" stroke="currentColor" strokeWidth="1.5" strokeOpacity="0.3"/>
      <path d="M7 1.5A5.5 5.5 0 0 1 12.5 7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
    </svg>
  );
}
