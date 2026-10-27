# Martech Stack Mapper

Maps a martech stack — Google Tag Manager (web + server), Google Analytics 4, Google Ads and Meta Ads — into one graph of how the tools connect, then surfaces integration issues and data anomalies, with an edit → approve → apply workflow for fixes.

**Phase 1 is a clickable prototype running on dummy data** for a fictional lead-gen business, BrightPath Solar. No live integrations; nothing is sent to any platform. Requirements: [docs/REQUIREMENTS.md](docs/REQUIREMENTS.md).

## What's in the prototype

| Screen | What it shows |
|---|---|
| Stack map | Tools and their connections, coloured by health. Click a tool or a connection. |
| Relationships | Every inferred link (filterable), a tool-to-tool matrix, and "if this breaks, what's affected". |
| Tool screens | One per tool. Click any tag, event, conversion or campaign to see its upstream and downstream lineage, config and raw source data. |
| Integration issues | 23 checks; 14 seeded issues with evidence, diagnosis and a recommended fix. |
| Data anomalies | Spend-driven, tracking outage and bot traffic — detected and classified from daily data, with the likely cause. |
| Fix queue | Edit the recommendation, approve, apply (simulated). GTM fixes publish a new container version. |
| Scans & sources | Scan history, "Re-scan now", and what each live connection will need in Phase 2. |

State (edits, applied fixes, scans) is kept in your browser. **Reset demo** in the top bar restores the original data.

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
  engine/workflow.ts     Approve / apply / re-scan state transitions
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
