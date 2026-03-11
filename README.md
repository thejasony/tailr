# Outreach Generator — Applied Intuition Recruiting

A Next.js web app for Applied Intuition recruiters to generate highly personalized outreach messages from LinkedIn profiles.

## How It Works

1. **Paste** a LinkedIn profile's full page text
2. **Parse** — OpenAI GPT-4o extracts name, title, company, and location
3. **Generate** — the backend runs 4 parallel research tasks:
   - Glassdoor/Blind sentiment scraping via Tavily
   - Company headcount lookup via Tavily
   - Applied Intuition latest news via Tavily (pre-seeded with Series F facts)
   - CEO/culture themes via YouTube Data API
4. **Output** — GPT-4o crafts a 150–200 word personalized message with a Copy button and collapsible Research Used panel

## Setup

### 1. Install dependencies

```bash
cd outreach-generator
npm install
```

### 2. Add API keys

Edit `.env.local` in the project root:

```env
OPENAI_API_KEY=sk-...         # https://platform.openai.com/api-keys
TAVILY_API_KEY=tvly-...       # https://app.tavily.com
YOUTUBE_API_KEY=AIza...       # https://console.cloud.google.com — enable YouTube Data API v3
```

### 3. Run the dev server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## API Keys Setup

| Key | Where to get it |
|-----|----------------|
| `OPENAI_API_KEY` | [platform.openai.com/api-keys](https://platform.openai.com/api-keys) — requires GPT-4o access |
| `TAVILY_API_KEY` | [app.tavily.com](https://app.tavily.com) — free tier available |
| `YOUTUBE_API_KEY` | [Google Cloud Console](https://console.cloud.google.com) → Enable "YouTube Data API v3" → Create credentials → API Key |

## Project Structure

```
outreach-generator/
├── app/
│   ├── page.tsx                  # Main single-page UI
│   ├── layout.tsx
│   └── api/
│       ├── parse-profile/
│       │   └── route.ts          # POST /api/parse-profile — OpenAI profile extraction
│       └── generate/
│           └── route.ts          # POST /api/generate — research + message generation
├── components/
│   ├── ProfileForm.tsx           # Step 1 & 2 UI: paste, parse, review fields
│   └── OutputSection.tsx         # Step 4 UI: message output + research panel
├── types/
│   └── index.ts                  # Shared TypeScript types
└── .env.local                    # API keys (not committed)
```

## Message Logic Summary

| Candidate's Company Size | Lead Angle |
|--------------------------|------------|
| Large (5,000+) | Impact & ownership — contrast slow promo cycles |
| Mid-Large (1,000–5,000) | Growth trajectory — $6B → $15B in 12 months |
| Mid (500–1,000) | Growth + breadth across 4 industries |
| Small (< 500) | Breadth of work — cars, drones, mines, trucks |

| Candidate's Title Contains | Focus |
|----------------------------|-------|
| CHRO / VP People / HR | Culture, financial health, Qasar's values, IPO |
| Engineer / Software / ML / AI | Technical scope, product breadth, ship velocity |
| Sales / GTM / BizDev | Revenue growth, new markets, IPO upside |
| Product / PM / Program Manager | Multi-industry product problems at scale |
