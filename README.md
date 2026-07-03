# loot.tn — Daily Promo Radar

A fully automated dashboard that, every day:
1. Fetches loot.tn's homepage for context.
2. Uses the Anthropic API (Claude + web search) to research current Steam/platform sales, major new game releases, and gaming news.
3. Writes a structured report to `data/dashboard.json`.
4. Publishes it as a static site via GitHub Pages.

No server to maintain — GitHub Actions runs the job on a schedule for free.

## One-time setup (~10 minutes)

1. **Create a new GitHub repository** (public or private) and push everything in this folder to it.
   ```bash
   cd loot-dashboard
   git init
   git add .
   git commit -m "Initial commit"
   git branch -M main
   git remote add origin https://github.com/<your-username>/<your-repo>.git
   git push -u origin main
   ```

2. **Get an Anthropic API key** at [console.anthropic.com](https://console.anthropic.com) if you don't have one (Settings → API Keys).

3. **Add it as a repo secret:**
   Repo → Settings → Secrets and variables → Actions → New repository secret
   - Name: `ANTHROPIC_API_KEY`
   - Value: your key

4. **Enable GitHub Pages:**
   Repo → Settings → Pages → Build and deployment → Source: **GitHub Actions**

5. **Enable Actions permissions:**
   Repo → Settings → Actions → General → Workflow permissions → **Read and write permissions**

6. **Trigger the first run manually** (don't wait for the cron):
   Repo → Actions tab → "Daily loot.tn promo dashboard update" → Run workflow

7. Once it finishes (~1-2 min), your dashboard is live at:
   `https://<your-username>.github.io/<your-repo>/`

After that, it updates itself every day at 07:00 UTC (08:00 Tunisia time) — no action needed. You can also click "Run workflow" any time for an on-demand refresh.

## Files

- `scripts/update-dashboard.mjs` — the research + report-generation script (Node 20+, no external dependencies, uses native `fetch`).
- `.github/workflows/daily-dashboard.yml` — the cron schedule + Pages deployment.
- `index.html` — the dashboard UI (reads `data/dashboard.json`).
- `data/dashboard.json` — today's report. Seeded with a manual example; overwritten daily by the Action.

## Customizing

- **Change schedule:** edit the `cron:` line in `.github/workflows/daily-dashboard.yml` ([crontab.guru](https://crontab.guru) helps with syntax).
- **Change what it researches:** edit the `systemPrompt` in `scripts/update-dashboard.mjs` — e.g. add specific competitor sites to check, focus on specific platforms, or change the report schema.
- **Cost:** each run is one Claude API call with a handful of web searches — a few cents per day at typical usage.

## Troubleshooting

- **Workflow fails with a 401/auth error:** double check the `ANTHROPIC_API_KEY` secret is set correctly and hasn't expired.
- **"No report yet" on the dashboard:** the Action hasn't run successfully yet — check the Actions tab for logs.
- **Pages shows a 404:** make sure Pages is set to deploy via "GitHub Actions" (not "Deploy from a branch") and that the workflow completed successfully.
