// update-dashboard.mjs
// Runs once a day (via GitHub Actions cron). Calls the Anthropic API with the
// web_search tool to research current gaming news, Steam sales, and new
// releases, cross-references loot.tn's actual catalog, and writes a
// structured JSON file the dashboard (index.html) reads.

import fs from "node:fs/promises";

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
if (!ANTHROPIC_API_KEY) {
  console.error("Missing ANTHROPIC_API_KEY environment variable.");
  process.exit(1);
}

const MODEL = "claude-sonnet-5";
const SITE_URL = "https://loot.tn";

// --- 1. Grab a snapshot of loot.tn's own homepage text so the model has ---
// --- real, current context on what the store already sells/promotes.   ---
async function fetchSiteSnapshot(url) {
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0 (loot-dashboard-bot)" },
    });
    const html = await res.text();
    // Very lightweight tag stripping — good enough for giving the model
    // readable context, not meant to be a full scraper.
    const text = html
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    return text.slice(0, 6000);
  } catch (err) {
    console.error("Could not fetch site snapshot:", err.message);
    return "(site fetch failed — proceed using general knowledge of loot.tn as a Tunisian digital game key / gift card / subscription store)";
  }
}

// --- 2. Ask Claude to research + produce a strict JSON recommendation ---
async function generateReport(siteSnapshot) {
  const today = new Date().toISOString().slice(0, 10);

  const systemPrompt = `You are a marketing analyst for loot.tn, a Tunisian online store selling digital game keys, gaming accounts, gift cards, and subscriptions (Steam, PSN, Xbox, EA, Apple/Google gift cards, streaming/AI subscriptions, etc).

Today's date is ${today}.

Your job, every day:
1. Search the web for what's currently happening in gaming that matters for a store like loot.tn: active/upcoming Steam or platform sales, major new game releases in the next 1-4 weeks, and any big gaming news (delays, price changes, platform promos).
2. Search for what major streamers/content creators (Twitch, YouTube, Kick — e.g. xQc, Kai Cenat, Ninja, IShowSpeed, Shroud, big regional/French/Arab streamers relevant to a Tunisian audience) are currently playing, and what games are trending on those platforms right now.
3. Compare that against the snapshot of loot.tn's current homepage provided below.
4. Produce concrete, specific promotion recommendations loot.tn should run TODAY — not generic marketing advice. Reference actual products/games where possible, including tie-ins to what's trending with streamers when relevant (e.g. "streamer X is playing game Y right now, stock/feature its key").

Respond with ONLY a single valid JSON object, no markdown fences, no commentary, matching exactly this schema:

{
  "generated_at": "ISO date string",
  "active_sales": [
    { "name": string, "platform": string, "ends": string, "note": string }
  ],
  "new_releases": [
    { "title": string, "date": string, "platforms": string, "why_it_matters": string }
  ],
  "streamer_trends": [
    { "streamer": string, "platform": string, "playing": string, "why_it_matters": string }
  ],
  "recommendations": [
    { "priority": "high" | "medium" | "low", "action": string, "reason": string }
  ],
  "site_notes": string
}

Keep each string concise (1-2 sentences max). Aim for 2-5 items per array. For "streamer_trends", prioritize streamers/games whose current playthrough or trend could plausibly boost demand for a game key, account, or subscription loot.tn sells. Only include recommendations that are genuinely actionable for an online game-key/gift-card retailer.`;

  const userPrompt = `Current loot.tn homepage snapshot (raw extracted text, may be messy):\n\n${siteSnapshot}\n\nResearch today's gaming news/sales landscape and produce the JSON report.`;

  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 4096,
      system: systemPrompt,
      messages: [{ role: "user", content: userPrompt }],
      tools: [{ type: "web_search_20250305", name: "web_search" }],
    }),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Anthropic API error ${response.status}: ${errText}`);
  }

  const data = await response.json();

  // Concatenate all text blocks (search results produce extra tool-use
  // blocks interleaved with text — we only want the final text output).
  const textBlocks = data.content.filter((b) => b.type === "text").map((b) => b.text);
  const rawText = textBlocks.join("\n").trim();

  // The model sometimes prefaces the JSON with a sentence of commentary
  // before the fenced block, so pull out the fenced content (if any) first,
  // then narrow to the outermost {...} to drop any stray text around it.
  const fenceMatch = rawText.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenceMatch ? fenceMatch[1] : rawText;
  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");
  const cleaned = start !== -1 && end !== -1 ? candidate.slice(start, end + 1) : candidate.trim();

  let parsed;
  try {
    parsed = JSON.parse(cleaned);
  } catch (err) {
    console.error("Failed to parse model output as JSON. Raw output was:\n", rawText);
    throw err;
  }

  parsed.generated_at = new Date().toISOString();
  return parsed;
}

async function main() {
  console.log("Fetching loot.tn snapshot...");
  const snapshot = await fetchSiteSnapshot(SITE_URL);

  console.log("Calling Anthropic API for today's report...");
  const report = await generateReport(snapshot);

  await fs.mkdir(new URL("../data", import.meta.url), { recursive: true });
  const outPath = new URL("../data/dashboard.json", import.meta.url);
  await fs.writeFile(outPath, JSON.stringify(report, null, 2), "utf-8");

  console.log("Wrote", outPath.pathname);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
