# Martech Stack Mapper

Maps a martech stack — Google Tag Manager (web + server), Google Analytics 4, Google Ads and Meta Ads — into one graph of how the tools connect, then surfaces integration issues and data anomalies, with an edit → approve → apply workflow for fixes.

**Phase 1 is a clickable prototype running on dummy data** for a fictional lead-gen business, BrightPath Solar. No live integrations; nothing is sent to any platform. Requirements: [docs/REQUIREMENTS.md](docs/REQUIREMENTS.md).

## What's in the prototype

Built for two kinds of user: **clients** (monitor health, apply basic fixes) and **consultants** (full technical detail). Switch between them from the avatar menu; **Simple / Detailed** in the top bar controls how much technical detail is shown. Design rationale and research: [docs/UX.md](docs/UX.md).

| Screen | What it shows |
|---|---|
| Overview | One-line status, then a grid of each business conversion × GA4 / Google Ads / Meta: is it tracking, how many in the last 7 days, and what's wrong. Click a cell to see how the data gets there. |
| Problems | Issues, the anomalies they caused and their recommended fix, merged into one list with plain-language headlines. Detail shows the impact chart, likely cause, a role-aware fix card, and technical details (evidence, lineage, editable diff). |
| Stack map / Relationships | Tools and every inferred link between them, coloured by health. |
| Tool screens | One per tool. Click any tag, event, conversion or campaign for its journey, lineage, config and raw source data. |
| Scans & history | Every config change across the stack, scan history and "Re-scan now", and what each live connection will need in Phase 2. |
| Assistant (⌘I) | Ask about anything. Add context with **Ask AI** buttons, row checkboxes, chart date-range selection, ⌘K or `@`. Chips show exactly what will be sent. Replies are scripted from the demo data. |

**Fixes:** clients can apply low-risk fixes and request a consultant's review for the rest; consultants can edit, approve and apply anything. Nothing is sent to any platform.

State (edits, applied fixes, scans, chat) is kept in your browser. **Reset demo** in the sidebar restores the original data.

## How it's built

```
src/
  model/schema.ts        Zod schemas for the normalised data model (docs §8)
  connectors/demo/raw    Dummy data in each platform's own format (GTM export, GA4 Admin/Data API, Google Ads GAQL, Meta Graph API)
  connectors/normalize   Raw formats → entities, metrics, change events
  engine/graph.ts        Link inference from config + event-aware lineage walks
  engine/rules.ts        The 23 integration checks, with canned diagnoses and fixes
  engine/anomalies.ts    Anomaly detection and classification
  engine/fixes.ts        Editable fields, validation, applying changes
  engine/scan.ts         One scan: links → rules → issues/fixes → health → anomalies
  engine/workflow.ts     Approve / apply / request review / re-scan state transitions
  insights/              View models: problems (issues + anomalies + fixes), conversion grid, plain-language copy
  assistant/             Context items → payloads, and the scripted responder
  ui/                    React screens
middleware.ts            Basic-auth password gate for Vercel
```

Phase 2 replaces `connectors/demo` with live API fetches that return the same raw formats; everything downstream stays the same.

## Running locally

```bash
npm install
npm run dev        # http://localhost:5173
npm test           # engine tests
npm run build
```

## Deploying to Vercel (password protected)

1. In Vercel: **Add New → Project → Import** `martech-stack-mapper`. The Vite preset is detected automatically.
2. Before the first deploy, add environment variables (Settings → Environment Variables), for Production and Preview:
   - `DEMO_PASSWORD` — the password
   - `DEMO_USER` — optional, defaults to `demo`
3. Deploy. The browser will ask for the username and password.

`middleware.ts` refuses every request if `DEMO_PASSWORD` isn't set, so the site is never public by accident. After changing the variables, redeploy for them to take effect.
