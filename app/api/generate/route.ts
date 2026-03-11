import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// ─── Types ────────────────────────────────────────────────────────────────────

interface ParsedProfile {
  fullName: string;
  currentTitle: string;
  currentCompany: string;
  currentLocation: string;
}

type SizeCategory = "large" | "mid-large" | "mid" | "small";

interface ResearchData {
  glassdoorThemes: string[];
  companySize: string;
  companySizeCategory: SizeCategory;
  appliedIntuitionFacts: string[];
  ceoThemes: string[];
  youtubeVideos: { title: string; description: string }[];
}

// ─── Anthropic helper ─────────────────────────────────────────────────────────

async function claudeJson(prompt: string, maxTokens = 512): Promise<string> {
  const message = await client.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: maxTokens,
    messages: [{ role: "user", content: prompt }],
  });
  const raw = message.content[0].type === "text" ? message.content[0].text : "[]";
  return raw.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "").trim();
}

async function claudeText(systemPrompt: string, userPrompt: string): Promise<string> {
  const message = await client.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 512,
    system: systemPrompt,
    messages: [{ role: "user", content: userPrompt }],
  });
  const raw = message.content[0].type === "text" ? message.content[0].text : "";
  return raw.trim();
}

// ─── Tavily helper ────────────────────────────────────────────────────────────

async function tavilySearch(query: string, maxResults = 5): Promise<string> {
  const res = await fetch("https://api.tavily.com/search", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      api_key: process.env.TAVILY_API_KEY,
      query,
      max_results: maxResults,
      search_depth: "basic",
    }),
  });
  if (!res.ok) return "";
  const data = await res.json();
  const results: { title?: string; content?: string }[] = data.results ?? [];
  return results
    .map((r) => `Title: ${r.title ?? ""}\n${r.content ?? ""}`)
    .join("\n\n")
    .slice(0, 4000);
}

// ─── YouTube helper ───────────────────────────────────────────────────────────

async function youtubeSearch(query: string): Promise<{ title: string; description: string }[]> {
  const apiKey = process.env.YOUTUBE_API_KEY;
  if (!apiKey) return [];
  const url = `https://www.googleapis.com/youtube/v3/search?part=snippet&q=${encodeURIComponent(query)}&maxResults=3&type=video&key=${apiKey}`;
  const res = await fetch(url);
  if (!res.ok) return [];
  const data = await res.json();
  return (data.items ?? []).map((item: { snippet?: { title?: string; description?: string } }) => ({
    title: item.snippet?.title ?? "",
    description: item.snippet?.description ?? "",
  }));
}

// ─── Extract company headcount ────────────────────────────────────────────────

async function extractCompanySize(company: string, searchText: string): Promise<{ raw: string; category: SizeCategory }> {
  const cleaned = await claudeJson(
    `Based on this search result text about "${company}", estimate the company's current headcount.
Return ONLY valid JSON: { "headcount": number_or_null, "description": "brief description of size" }
If you cannot determine headcount, set headcount to null.

Text:
${searchText.slice(0, 2000)}`
  );
  try {
    const parsed = JSON.parse(cleaned);
    const n: number | null = parsed.headcount;
    let category: SizeCategory = "mid";
    if (n === null) category = "mid";
    else if (n >= 5000) category = "large";
    else if (n >= 1000) category = "mid-large";
    else if (n >= 500) category = "mid";
    else category = "small";
    return { raw: parsed.description ?? `~${n} employees`, category };
  } catch {
    return { raw: "Unknown size", category: "mid" };
  }
}

// ─── Extract Glassdoor/Blind themes ──────────────────────────────────────────

async function extractNegativeThemes(company: string, searchText: string): Promise<string[]> {
  if (!searchText.trim()) return [];
  const cleaned = await claudeJson(
    `You are analyzing employee review data for "${company}" from sources like Glassdoor and Blind.
Extract the top 3-5 recurring NEGATIVE themes that employees mention.
Return ONLY a JSON array of short theme descriptions (1-2 sentences each).
Example: ["Slow promotion cycles and unclear career ladders", "Management decisions feel opaque"]

Text:
${searchText.slice(0, 3000)}`
  );
  try {
    return JSON.parse(cleaned);
  } catch {
    return [];
  }
}

// ─── Extract Applied Intuition facts ─────────────────────────────────────────

async function extractAppliedFacts(searchText: string): Promise<string[]> {
  const baseFacts = [
    "Raised $600M Series F in June 2025 at a $15B valuation, co-led by BlackRock and Kleiner Perkins",
    "Valuation more than doubled in 12 months (from $6B to $15B)",
    "Approximately 1,300 employees",
    "IPO trajectory being considered",
    "Operates across Automotive, Defense, Trucking, and Construction/Mining verticals",
  ];

  if (!searchText.trim()) return baseFacts;

  const cleaned = await claudeJson(
    `Given this news text about Applied Intuition, extract any additional notable facts (funding, valuation, new contracts, expansions, awards, notable hires) not already in this list:
${baseFacts.map((f) => `- ${f}`).join("\n")}

News text:
${searchText.slice(0, 2000)}

Return ONLY a JSON array of NEW fact strings. If none, return [].`
  );
  try {
    const extra: string[] = JSON.parse(cleaned);
    return [...baseFacts, ...extra];
  } catch {
    return baseFacts;
  }
}

// ─── Extract CEO culture themes ───────────────────────────────────────────────

async function extractCeoThemes(videos: { title: string; description: string }[]): Promise<string[]> {
  if (videos.length === 0) {
    return [
      "Radical pragmatism — focus on what actually works, not what sounds good",
      "Intrinsic contrarianism — deliberately challenges conventional thinking",
      "Impact-driven culture — employees are expected to own outcomes, not just tasks",
      "People-first mentality — hiring exceptional people and trusting them deeply",
    ];
  }

  const videoText = videos.map((v) => `Title: ${v.title}\nDescription: ${v.description}`).join("\n\n");

  const cleaned = await claudeJson(
    `Based on these YouTube video titles and descriptions featuring Qasar Younis (CEO of Applied Intuition), extract the key cultural and leadership themes he discusses.
Return ONLY a JSON array of 3-5 theme strings (1-2 sentences each).

Videos:
${videoText}`
  );
  try {
    return JSON.parse(cleaned);
  } catch {
    return [];
  }
}

// ─── Title categorization ─────────────────────────────────────────────────────

function getTitleCategory(title: string): string {
  if (/(chief people|chro|vp people|head of hr|people ops|hr director|talent)/i.test(title)) return "hr_exec";
  if (/(engineer|software|ml|machine learning|ai|data scientist|developer|backend|frontend|fullstack|platform|infra)/i.test(title)) return "engineer";
  if (/(sales|revenue|gtm|go.to.market|business development|account exec|ae |sdr|bdr)/i.test(title)) return "sales";
  if (/(product manager|pm |program manager|product lead|vp product|cpo|head of product)/i.test(title)) return "product";
  return "general";
}

// ─── Message generation ───────────────────────────────────────────────────────

async function generateMessage(
  profile: ParsedProfile,
  locationOption: "exclude" | "include_disclaimer",
  research: ResearchData
): Promise<string> {
  const { fullName, currentTitle, currentCompany, currentLocation } = profile;
  const { glassdoorThemes, companySizeCategory, appliedIntuitionFacts, ceoThemes } = research;

  const titleCategory = getTitleCategory(currentTitle);

  const sizeAngles: Record<SizeCategory, string> = {
    large: `Lead with impact and ownership. The candidate is at a large company (${currentCompany}). Reference—without naming Glassdoor—the common frustration at large companies about slow promotion cycles, performance management culture, and difficulty seeing direct impact. Position Applied Intuition as a place where the team is lean enough that work ships fast and people notice.
Example angle: "Common feedback we hear from people at [Company] is that it can feel hard to see the direct impact of your work. Here, the team is lean enough that your work ships and people notice."`,

    "mid-large": `Lead with growth trajectory. The candidate is at a mid-large company of similar scale to Applied. Reference that Applied doubled valuation in one year ($6B → $15B). Challenge them: are they seeing that kind of momentum where they are?
Example angle: "You're already at a company of a similar scale — but are you seeing this kind of growth momentum around you? We went from $6B to $15B in 12 months."`,

    mid: `Lead with growth trajectory and breadth. Position Applied Intuition as a rare company at this scale that is growing exponentially AND operating across multiple industries (Automotive, Defense, Trucking, Construction/Mining).`,

    small: `Lead with breadth of work and industry exposure. The candidate is at a small company with likely deep specialization. Applied Intuition spans Automotive, Defense, Trucking, and Construction/Mining — engineers here get rare breadth of domain exposure.
Example angle: "Smaller companies often mean deep specialization in one thing. At Applied, we're building intelligence for cars, drones, mines, and more — the engineers here say they've never learned faster."`,
  };

  const titleAngles: Record<string, string> = {
    hr_exec: `Focus heavily on Applied Intuition's culture and financial health. Highlight the valuation growth, caliber of investors (BlackRock, Kleiner Perkins), IPO trajectory, and Qasar's publicly stated values around building a people-first, high-ownership culture.`,
    engineer: `Focus on technical scope, product breadth across 4 industries, and the speed at which engineers ship and see their work in production. Highlight the rare opportunity to work on autonomy across Automotive, Defense, Trucking, and Construction.`,
    sales: `Focus on revenue growth, Applied's expansion into new markets (Defense, Trucking, Construction/Mining alongside Automotive), and the IPO opportunity as a way to participate in the upside of what they're building.`,
    product: `Focus on how Applied's multiple industries create unique, high-stakes product problems at scale that PMs rarely get access to — building intelligence for cars is hard, building it for mines and drones simultaneously is extraordinary.`,
    general: `Focus on growth momentum, culture, and the unique opportunity to work on AI for physical autonomy across multiple high-stakes industries.`,
  };

  const locationInstruction =
    locationOption === "exclude"
      ? "Do NOT mention the candidate's location or the office location in the message."
      : `Include this exact line naturally in the message: "I couldn't find your exact location from LinkedIn, but this role is based in Sunnyvale, CA — wanted to be upfront about that."`;

  const systemPrompt = `You are a recruiter at Applied Intuition writing a personalized outreach message to a candidate on LinkedIn.

Write in first person, warm but direct, no corporate jargon, no bullet points, no em-dashes. Plain conversational prose. 150-200 words total.

The message must:
1. Address the candidate by first name
2. Use the size-based lead angle below
3. Incorporate the title-based personalization
4. Weave in at least 2 specific Applied Intuition facts
5. Reference 1-2 CEO cultural themes subtly (don't quote them directly)
6. Address location as instructed
7. End with a soft, specific call to action (e.g., "Would it be worth a 20-minute call?")

Do not mention Glassdoor or Blind by name. Reference employee sentiments naturally as "common patterns we hear from folks at [Company]" or similar.

Output ONLY the message text. No subject line. No "Hi [Name]," header. Start directly with the opener.`;

  const userPrompt = `Candidate:
- Name: ${fullName}
- Title: ${currentTitle}
- Company: ${currentCompany}
- Location: ${currentLocation || "unknown"}

Size-based lead angle (${companySizeCategory}):
${sizeAngles[companySizeCategory]}

Title-based personalization (${titleCategory}):
${titleAngles[titleCategory]}

Applied Intuition facts to use:
${appliedIntuitionFacts.map((f) => `- ${f}`).join("\n")}

CEO cultural themes from Qasar Younis:
${ceoThemes.map((t) => `- ${t}`).join("\n")}

Negative themes from employee reviews at ${currentCompany} (use as implicit contrast — do NOT cite the source):
${glassdoorThemes.length > 0 ? glassdoorThemes.map((t) => `- ${t}`).join("\n") : "- No specific themes found; use general tropes appropriate to their company size"}

Location instruction:
${locationInstruction}`;

  return claudeText(systemPrompt, userPrompt);
}

// ─── Route handler ────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const { profile, locationOption } = await req.json() as {
    profile: ParsedProfile;
    locationOption: "exclude" | "include_disclaimer";
  };

  if (!profile?.currentCompany) {
    return NextResponse.json({ error: "Missing profile data" }, { status: 400 });
  }

  const company = profile.currentCompany;

  const [glassdoorText, companySizeText, appliedNewsText, youtubeVideos] = await Promise.all([
    tavilySearch(`${company} Glassdoor reviews ${company} Blind app reviews employee feedback`),
    tavilySearch(`${company} number of employees headcount 2025`),
    tavilySearch("Applied Intuition 2025 news funding valuation IPO Series F"),
    youtubeSearch("Qasar Younis Applied Intuition"),
  ]);

  const [glassdoorThemes, sizeResult, appliedFacts, ceoThemes] = await Promise.all([
    extractNegativeThemes(company, glassdoorText),
    extractCompanySize(company, companySizeText),
    extractAppliedFacts(appliedNewsText),
    extractCeoThemes(youtubeVideos),
  ]);

  const research: ResearchData = {
    glassdoorThemes,
    companySize: sizeResult.raw,
    companySizeCategory: sizeResult.category,
    appliedIntuitionFacts: appliedFacts,
    ceoThemes,
    youtubeVideos,
  };

  const message = await generateMessage(profile, locationOption, research);

  return NextResponse.json({ message, research });
}
