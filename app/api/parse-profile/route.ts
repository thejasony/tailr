import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export async function POST(req: NextRequest) {
  const { text } = await req.json();

  if (!text || typeof text !== "string") {
    return NextResponse.json({ error: "Missing text" }, { status: 400 });
  }

  const message = await client.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 256,
    messages: [
      {
        role: "user",
        content: `You are a LinkedIn profile parser. Extract structured information from raw LinkedIn profile text.
Return ONLY valid JSON with these exact keys:
{
  "fullName": string,
  "currentTitle": string,
  "currentCompany": string,
  "currentLocation": string
}

Rules:
- fullName: the person's full name as it appears on LinkedIn
- currentTitle: their current or most recent job title
- currentCompany: the company name for their current or most recent role
- currentLocation: their listed location (city, state, country). If only a country is listed, use just that country name.
- If any field cannot be determined, use an empty string "".
- Do not include any explanation, only the JSON object.

LinkedIn profile text:
${text.slice(0, 8000)}`,
      },
    ],
  });

  const raw = message.content[0].type === "text" ? message.content[0].text : "{}";
  const cleaned = raw.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "").trim();

  try {
    const parsed = JSON.parse(cleaned);
    return NextResponse.json(parsed);
  } catch {
    return NextResponse.json({ error: "Failed to parse AI response", raw }, { status: 500 });
  }
}
