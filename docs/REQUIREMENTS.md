# Martech Stack Mapper — Phase 1 Requirements (Prototype)

**Status:** Agreed — prototype in build · **Date:** 2026-10-27 · **Owner:** Malik Ahmad

---

## 1. Purpose

Martech Stack Mapper pulls configuration and performance data from a marketing technology stack, works out how the tools connect to each other, and uses that map to surface broken integrations and data anomalies.

**Phase 1 is a clickable prototype.** It runs entirely on realistic dummy data with **no live integrations**. The goal is to see what the product looks like and how it behaves before investing in API work. The data structures, however, are designed to be the real ones. When live integrations are built in Phase 2, they will produce the same shape of data and the UI will not need to change.

### 1.1 Success criterion

> The prototype successfully maps the martech stack with proper linkages between each tool, so that any conversion can be traced end to end — from the website event, through GTM web and server, to GA4, Google Ads and Meta — and back.

### 1.2 Tools in scope

| Tool | What the prototype models |
|---|---|
| Google Tag Manager — Web | Container, tags, triggers, variables, versions |
| Google Tag Manager — Server | Container, clients, tags, triggers, variables, versions |
| Google Analytics 4 | Property, data streams, events, key events, custom dimensions, product links (config), plus daily aggregate traffic (sessions, engaged sessions, event counts by channel) for anomaly detection |
| Google Ads | Account settings, conversion actions, campaigns, daily campaign performance, daily conversions |
| Meta Ads | Ad account, campaigns, daily performance, Pixel/dataset, Pixel + Conversions API events, deduplication, event match quality, custom conversions, Events Manager diagnostics |

### 1.3 Use cases

| # | Use case | Phase 1 prototype |
|---|---|---|
| 1 | Visual overview of the whole stack | ✅ Stack map |
| 2 | Relationships and dependencies between tools | ✅ Relationships screen + per-tool screens with click-through lineage |
| 3 | Identify integration and setup issues | ✅ Issues screen, driven by a rules catalogue |
| 4 | Identify data anomalies | ✅ Anomalies screen, three anomaly types kept separate |
| 5 | Diagnose → recommend → edit → approve → apply fixes | ✅ Simulated. No autonomous fixing; nothing is written to any platform |

---

## 2. Scope

### 2.1 In scope (Phase 1)

- Single user (the owner), single account per platform.
- A single fictional lead-gen business with a complete, internally consistent dummy dataset (see §4).
- All screens listed in §5, fully navigable.
- Canned (pre-written) diagnoses and recommendations — no live LLM calls.
- Simulated fix workflow: edit recommendation → approve → "apply" → issue resolved, change logged, config version bumped.
- Simulated scans: a daily scheduled scan history plus a "Re-scan now" button.
- Deployed to Vercel, behind a password.
- A research section (§9) on how to fetch this data automatically every day, for Phase 2.

### 2.2 Out of scope (Phase 1)

- Any live API connection, OAuth, or credential storage.
- File upload/parsing of real GTM exports (deferred — dummy data only).
- Live LLM calls (deferred — canned text only).
- Multi-user, authentication, roles, client workspaces.
- Additional tools (consent platform, CRM, CDP, website platform). These may appear as labels in dummy data where needed for realism but are not modelled as tools.
- Real write-back to any platform.

---

## 3. Users and access

- One user: the owner. No user accounts in the prototype.
- The Vercel deployment is **password protected**. Vercel's built-in password protection isn't available on the Hobby plan, so the app ships a small Vercel Routing Middleware (`middleware.ts`) that asks for HTTP Basic Auth on every request. The password is set in the Vercel project as the `DEMO_PASSWORD` environment variable (and optionally `DEMO_USER`, default `demo`). If `DEMO_PASSWORD` is not set, the middleware refuses all requests, so the site is never accidentally public.
- Prototype state (approved/applied fixes, edits, re-scans) is stored in the browser (`localStorage`) so it survives a page refresh. A **"Reset demo"** action restores the original dataset.

---

## 4. Dummy dataset

### 4.1 The fictional business

**BrightPath Solar** — a residential solar installer generating leads online. All names, IDs and domains are fictional.

| Item | Dummy value |
|---|---|
| Website | `www.brightpathsolar.example` |
| Server container endpoint | `sgtm.brightpathsolar.example` |
| GTM Web container | `GTM-BPW7K2Q` |
| GTM Server container | `GTM-BPS4N9R` |
| GA4 property / web stream | `412345678` / `G-BP12XYZ9QK` |
| Google Ads account | `123-456-7890` |
| Meta ad account / dataset (Pixel) | `act_1029384756` / `887766554433221` |
| Data window | 60 days of daily data ending on the "latest scan" date |

### 4.2 Lead-gen conversions

The intended design is below. The dummy data deliberately breaks parts of it (§6.3).


| Business event | dataLayer event | GA4 event / key event | Google Ads conversion action | Meta event |
|---|---|---|---|---|
| Quote request form | `quote_submit` | `generate_lead` (key event) | Quote Request (primary, Google Ads tag) | `Lead` (Pixel + CAPI) |
| Book a consultation | `consult_booked` | `book_consultation` (key event) | Consultation Booked (GA4 import) | `Schedule` (Pixel + CAPI) |
| Phone call click | `phone_click` | `phone_call_click` (key event) | Phone Call Click (secondary) | `Contact` (Pixel only) |
| Newsletter signup | `newsletter_signup` | `sign_up` | — | `CompleteRegistration` |
| Qualified lead (offline) | — | — | Qualified Lead (offline click import, primary) | Custom conversion "Qualified Lead" |

### 4.3 Data flow modelled

```
Website dataLayer
  └─► GTM Web
        ├─► Google tag (GA4) ──transport_url──► GTM Server
        │                                         ├─ GA4 client
        │                                         ├─► GA4 tag ───────────► GA4 property
        │                                         └─► Meta CAPI tags ────► Meta dataset
        ├─► Google Ads conversion tags + Conversion Linker ─► Google Ads
        └─► Meta Pixel tags ───────────────────────────────► Meta dataset (dedup with CAPI via event_id)
GA4 ◄──── product link ────► Google Ads (key-event import, audiences)
```

### 4.4 Seeded problems

The dataset intentionally contains the issues and anomalies listed in §6.3 and §7.3, so that every screen has something meaningful to show. Some links are healthy, some degraded, some broken.

---

## 5. Screens

Global layout: left navigation, top bar showing the latest scan time, overall health score, and a **Re-scan now** button.

### 5.1 Stack Map (overview)

- A high-level node graph: **GTM Web → GTM Server → GA4 / Google Ads / Meta**, plus the GA4 ↔ Google Ads link and the direct browser paths (Pixel, Ads tag).
- One node per tool, no drill-down inside the graph. Each node shows tool name, account/container ID, and counts of open issues and anomalies.
- Each edge is a summarised connection (e.g. "Web → Server: 14 events via transport URL") and is **coloured by health**: healthy, degraded (warnings), broken (critical issues), inactive.
- Clicking a node opens that tool's screen (§5.3). Clicking an edge opens the Relationships screen filtered to that connection.
- Summary cards beside the map: overall health score, open issues by severity, active anomalies by type, pending fixes.

### 5.2 Relationships & Dependencies

- A filterable table of every individual link between entities, across tools. Examples:
  - *GA4 key event `generate_lead` → imported into Google Ads "Quote Request"*
  - *Meta Pixel `Lead` ⇄ CAPI `Lead` — deduplicated via `event_id`*
  - *GTM Web tag "GA4 – generate_lead" → fired by trigger "CE – quote_submit"*
- Columns: source (tool · entity), relationship type, target (tool · entity), health, related issues.
- Filters: source tool, target tool, relationship type, health.
- A **tool-to-tool matrix** view (rows = from, columns = to) showing link counts and worst health per pair.
- **Dependency impact:** selecting an entity lists everything downstream that depends on it ("if this trigger breaks, these 6 tags and 4 conversions are affected").

### 5.3 Tool screens (one per tool, with click-through lineage)

Five screens: **GTM Web, GTM Server, GA4, Google Ads, Meta**.

Each screen has:

- **Header:** account/container IDs, last version/config change, key settings (e.g. auto-tagging, consent mode, enhanced conversions, transport URL).
- **Entity tabs** appropriate to the tool:
  - GTM Web / Server: Tags, Triggers, Variables, (Server) Clients, Versions
  - GA4: Data streams, Events, Key events, Custom dimensions, Links, Settings
  - Google Ads: Conversion actions, Campaigns (with performance), Settings
  - Meta: Events (Pixel/CAPI), Custom conversions, Campaigns (with performance), Dataset quality
- Each row shows health, open-issue count, and **upstream / downstream counts**.
- **Entity detail panel** (opens on click):
  - Configuration fields.
  - **Upstream chain:** where this comes from, step by step, back to the dataLayer event.
  - **Downstream chain:** where this goes.
  - Every step is a link that jumps to that entity on its own tool screen.
  - Related issues and anomalies.

**Example:** On the Meta screen, open the `Lead` event → upstream shows two paths:
1. Browser: *Pixel tag "Meta – Lead" (GTM Web) ← trigger "CE – quote_submit" ← dataLayer `quote_submit`*
2. Server: *CAPI tag "Meta CAPI – Lead" (GTM Server) ← client "GA4" ← Google tag `generate_lead` (GTM Web) ← trigger "CE – quote_submit" ← dataLayer `quote_submit`*

Clicking "Meta – Lead" jumps to the GTM Web screen with that tag's detail open.

### 5.4 Integration Issues

- List of detected issues, grouped by category: **Conversion tracking, Cookies & click IDs, Consent, Configuration & linking, Data quality**.
- Each issue: severity (critical / high / medium / low), title, affected tools and entities, detection rule, first detected, status (open / fix pending / resolved / dismissed).
- **Issue detail:**
  - **Evidence:** what was observed (config values, counts).
  - **Diagnosis:** plain-language explanation of what is wrong and the business impact (canned).
  - **Affected lineage:** a mini chain highlighting the broken step; each step clickable.
  - **Recommended fix** with a "Review fix" button → Fix Queue.

### 5.5 Data Anomalies

Three anomaly types, kept on separate tabs because they mean different things and need different responses:

| Type | What it means | How it is identified |
|---|---|---|
| **Spend-driven** | Traffic/conversion changes explained by a change in spend or budget. Usually expected. | Spend moved significantly, and clicks/conversions moved in proportion (CPC/CPA stayed within normal range). Linked to the budget/bid change event when available. |
| **Tracking outage** | Conversions or events dropped (or spiked) because tracking changed or broke, not because performance changed. | Conversions/events moved sharply while spend and clicks stayed stable; and/or a source went to zero; and/or a config change (e.g. GTM publish) happened at the break point. Linked to that change event. |
| **Bot / invalid traffic** | Artificial increase from non-human or junk traffic. | Clicks/events spiked without matching spend logic: CTR jump, conversion rate collapse, concentration in one placement/geo, form leads rising while qualified leads stay flat. |

Each anomaly shows:
- Metric, entity, date window, baseline vs observed, % change, confidence.
- A **time-series chart** with the anomaly window highlighted and change events marked on the timeline.
- **Likely cause** with links to the related change event, issue or campaign.
- Recommended action (canned). Tracking outages can link to a fix in the Fix Queue.
- Status: new / acknowledged / resolved / expected (spend-driven anomalies can be marked "expected").

### 5.6 Fix Queue (diagnose → recommend → edit → approve → apply)

- List of fix proposals with status: **Draft → Edited → Approved → Applied** (or **Rejected**).
- **Fix detail:**
  - The issue it resolves and the diagnosis.
  - **Proposed change as a structured diff** per target: e.g. *GTM Web · Tag "Meta – Lead" · `eventId`: (empty) → `{{DLV – event_id}}`*.
  - Plain-language steps (for changes that need doing by hand on a platform).
  - Risk level and what to check after applying.
- **Edit before publishing (required):**
  - Every proposed value in the diff is editable (text, dropdown or toggle, depending on the field).
  - Operations can be removed, or additional ones added from a list of fields valid for that entity.
  - The rationale/notes text is editable.
  - Validation before approval (e.g. a variable reference must exist in the container; a conversion action must have a category).
  - Edit history kept: original recommendation vs. edited version, with "Revert to recommendation".
- **Approve & apply (simulated):** a confirmation dialog shows the final diff. On apply:
  - The target entity's config is updated in the prototype's data.
  - For GTM, a new container version is created (e.g. v48 → v49) with your notes as the version description.
  - The linked issue is marked resolved and affected links re-evaluated (map colours update).
  - An entry is added to the change log.
- **Change log:** every applied fix — timestamp, target, before/after, notes.
- A clear banner: *"Prototype — changes are simulated and not sent to any platform."*

### 5.7 Scans & Sources

- **Scan history:** daily scheduled scans (simulated, ~30 entries) plus on-demand scans. Each shows trigger (scheduled / on-demand / change detected), duration, sources scanned, and a diff summary (new issues, resolved issues, config changes).
- **Re-scan now:** runs a simulated scan (progress animation per source), creates a new scan entry, and re-evaluates rules against the current (possibly fixed) data.
- **Sources panel:** one card per tool showing connection status ("Demo data" in Phase 1), last sync time, entity counts, and — for Phase 2 — what the live connection will need (see §9).

---

## 6. Integration-issue detection

### 6.1 Approach

Issues are produced by a **rules engine** that runs over the normalised data model (§8). Each rule has an ID, category, severity, a check, and a canned diagnosis/recommendation template. In Phase 1 the rules really run on the dummy data in the browser, so applying a fix and re-scanning genuinely clears the issue.

### 6.2 Rules catalogue

| ID | Category | Rule |
|---|---|---|
| CT-01 | Conversion tracking | A GA4 key event that a Google Ads conversion action expects to import is missing, not marked as a key event, or not received recently. |
| CT-02 | Conversion tracking | A conversion action's daily conversions collapsed (≥ 70% below baseline over the last 7 days) while clicks stayed stable. Evidence includes recent config changes on its upstream lineage. |
| CT-03 | Conversion tracking | Conversion action uses "Every" counting for a lead action (should usually be "One"). |
| CT-04 | Conversion tracking | The same lead is counted twice as a primary conversion (Google Ads tag and GA4 import both primary for one business event). |
| CT-05 | Conversion tracking | Conversion tag sends no value or currency, or a value that conflicts with the action's default value settings. |
| CT-06 | Conversion tracking | Conversion trigger fires on page view of the form page instead of a confirmed submission event. |
| CT-07 | Conversion tracking | Offline conversion action ("Qualified Lead") has had no uploads in 14 days. |
| MT-01 | Conversion tracking (Meta) | Pixel and CAPI both send an event but `event_id` is missing or mismatched → duplicates not removed. |
| MT-02 | Conversion tracking (Meta) | CAPI event has low event match quality (missing hashed email/phone, `fbp`, `fbc`, IP, user agent). |
| MT-03 | Conversion tracking (Meta) | Event used for campaign optimisation has no server (CAPI) coverage. |
| CK-01 | Cookies & click IDs | Conversion Linker missing or not firing on all pages → `gclid`/`gbraid`/`wbraid` not stored. |
| CK-02 | Cookies & click IDs | Server container not setting first-party cookies (cookie domain mismatch or FPID disabled). |
| CK-03 | Cookies & click IDs | `fbc`/`fbp` not passed through to the CAPI tag. |
| CN-01 | Consent | Consent Mode v2 defaults missing `ad_user_data` / `ad_personalization`. |
| CN-02 | Consent | Advertising tag fires without a consent check (no consent requirement configured on the tag). |
| CN-03 | Consent | Consent default tag doesn't fire on the Consent Initialization trigger, so Google tags can load before defaults are set. |
| CF-01 | Configuration & linking | GA4 measurement ID in a GTM tag doesn't match the GA4 property's web stream. |
| CF-02 | Configuration & linking | Google tag missing `server_container_url` → events bypass the server container. |
| CF-03 | Configuration & linking | Google Ads auto-tagging is off. |
| CF-04 | Configuration & linking | Enhanced conversions for leads enabled in Google Ads but no user-provided data sent by the tag. |
| CF-05 | Configuration & linking | GA4 ↔ Google Ads link missing or personalised advertising disabled on the link. |
| CF-06 | Configuration & linking | Tag references a deleted/paused trigger; server tag has no client that can produce its event. |
| DQ-01 | Data quality | Conversion counts differ between platforms beyond tolerance (e.g. GA4 `generate_lead` vs Ads "Quote Request" vs Meta `Lead` > 25% apart for the same day range). |

### 6.3 Seeded issues in the dummy data

| Rule | Seeded instance |
|---|---|
| CT-01 | Google Ads "Consultation Booked" imports GA4 `book_consultation`, but it stopped being a key event on Oct 6. |
| CT-02 | "Quote Request" conversions collapsed after GTM Web v47 changed trigger "CE – quote_submit" to listen for `quote_submitted`. |
| CT-03 | "Phone Call Click" counts every conversion instead of one per click. |
| CT-04 | Quote requests counted twice as primary: "Quote Request" (Ads tag) and "generate_lead (GA4)". |
| CT-07 | "Qualified Lead" offline import: no uploads since Oct 10. |
| MT-01 | Pixel tag "Meta – Lead" sends no `event_id`, so Pixel and CAPI `Lead` aren't deduplicated. |
| MT-02 | CAPI `Lead` sends no hashed email/phone → low event match quality. |
| CK-01 | Conversion Linker only fires on landing pages. |
| CK-03 | CAPI tags don't map `fbc` / `fbp`. |
| CN-01 | Consent defaults missing `ad_user_data` and `ad_personalization`. |
| CN-02 | Meta Pixel tags have no consent requirement. |
| CF-04 | Enhanced conversions for leads is on in Google Ads, but the "Quote Request" tag sends no user data. |
| CF-06 | Tag "Ads – Newsletter (old)" fires on a trigger that no longer exists. |
| DQ-01 | Meta reports ~1.8× more leads than GA4 and Google Ads (caused by MT-01). |

The other 9 rules pass and show as passing checks. Each seeded issue has a matching canned fix.

Rules that depend on data rather than config (CT-02, CT-07, DQ-01) can't be confirmed fixed until new data arrives. After their fix is applied they show as **Resolved — verifying with next data**.

---

## 7. Anomaly detection

### 7.1 Data used

- Google Ads: daily campaign spend, impressions, clicks, conversions per conversion action.
- Meta: daily campaign spend, impressions, clicks, events by placement; Pixel/CAPI event counts.
- GA4: daily sessions and engaged sessions by channel, and daily event counts (as if from the GA4 Data API).
- Change events: GTM version publishes, GA4 config changes, Google Ads changes (budgets, bids, conversion settings), Meta account activity.

### 7.2 Method (prototype runs it on dummy data)

1. **Baseline:** for each metric/entity, the median of the same weekday over the previous 4 weeks (robust to weekly seasonality).
2. **Detect:** flag a day/window when the deviation exceeds a threshold (robust z-score using MAD, default |z| ≥ 3, and a minimum absolute change to ignore tiny numbers).
3. **Classify:**
   - *Spend-driven* if spend moved by ≥ 20% in the same direction and CPA/CPC stayed within ±15% of baseline.
   - *Tracking outage* if conversions/events moved ≥ 50% while spend/clicks stayed within ±15%, or a source went to zero; confidence boosted when a config change occurred within 24h of the break.
   - *Bot / invalid traffic* if clicks/events rose while conversion rate fell sharply, CTR jumped, traffic concentrated in one placement/geo, or leads rose without a matching rise in qualified leads.
4. **Attribute:** attach the nearest relevant change event, campaign or issue as the likely cause.

### 7.3 Seeded anomalies

| Type | Scenario |
|---|---|
| Type | Scenario (data ends Oct 26, 2026) |
|---|---|
| Spend-driven | Sep 22: Google Ads "Search – Solar Quotes" budget raised 40% → spend and clicks up together, CPA flat. |
| Spend-driven | Oct 1–5: Meta "Retargeting – Site Visitors" paused → spend, clicks and leads down together. |
| Tracking outage | Sep 27–29: server container v12 broke the CAPI `Schedule` tag → server `Schedule` events at zero until v13. |
| Tracking outage | Oct 6: GA4 `book_consultation` un-marked as a key event → Google Ads "Consultation Booked" drops to zero (linked to CT-01). |
| Tracking outage | Oct 10: offline "Qualified Lead" uploads stop (linked to CT-07). |
| Tracking outage | Oct 18: GTM Web v47 changes the quote trigger → "Quote Request", GA4 `generate_lead` and Meta `Lead` drop ~90% while clicks hold (linked to CT-02). |
| Bot / invalid traffic | Oct 8–14: Meta "Prospecting – Lookalike" clicks ×3 and CTR ×4 with flat spend, concentrated in Audience Network; GA4 Paid Social engagement rate falls from ~60% to ~20%. |

The likely cause is found by intersecting the anomaly's **upstream lineage** with change events near the start of the window. For example, the Oct 18 outage is attributed to GTM Web v47 because v47 changed a trigger upstream of "Quote Request".

---

## 8. Data model

The data model is the part of Phase 1 that must be "real". It is split into three layers.

### 8.1 Layer 1 — Raw source snapshots

The exact shape each platform's API or export returns (GTM container export JSON, GA4 Admin API resources, Google Ads GAQL rows, Meta Graph API objects). In Phase 1 these are dummy JSON files that follow the real formats. Stored per scan, so changes can be diffed.

```ts
interface SourceSnapshot {
  id: string;
  scanId: string;
  source: 'gtm_web' | 'gtm_server' | 'ga4' | 'google_ads' | 'meta';
  fetchedAt: string;              // ISO timestamp
  format: string;                 // e.g. 'gtm_container_export_v2', 'ga4_admin_v1beta'
  payload: unknown;               // raw API/export shape
}
```

### 8.2 Layer 2 — Normalised graph (what the UI and rules use)

Connectors (dummy in Phase 1, live in Phase 2) translate raw snapshots into a common graph of **tools, entities and links**.

```ts
type ToolId = 'gtm_web' | 'gtm_server' | 'ga4' | 'google_ads' | 'meta';
type Health = 'healthy' | 'degraded' | 'broken' | 'inactive' | 'unknown';

interface Tool {
  id: ToolId;
  name: string;
  externalId: string;             // container / property / account ID
  settings: Record<string, unknown>; // e.g. autoTagging, consentMode, transportUrl
  lastChangedAt?: string;
}

type EntityKind =
  // GTM (web + server)
  | 'gtm_container' | 'gtm_version' | 'gtm_tag' | 'gtm_trigger' | 'gtm_variable' | 'gtm_client'
  // Site
  | 'datalayer_event'
  // GA4 (a key event is a ga4_event with config.isKeyEvent = true)
  | 'ga4_property' | 'ga4_stream' | 'ga4_event' | 'ga4_custom_dimension' | 'ga4_link'
  // Google Ads
  | 'gads_account' | 'gads_conversion_action' | 'gads_campaign'
  // Meta
  | 'meta_ad_account' | 'meta_dataset' | 'meta_event' | 'meta_custom_conversion' | 'meta_campaign';

interface Entity {
  id: string;                     // stable internal ID, e.g. 'gtm_web:tag:42'
  tool: ToolId | 'site';
  kind: EntityKind;
  externalId: string;             // ID in the source platform
  name: string;
  status: 'active' | 'paused' | 'deleted';
  config: Record<string, unknown>; // normalised config fields (editable by fixes)
  health: Health;
  sourceRef: { snapshotId: string; path: string }; // pointer back to raw data
}

type LinkType =
  | 'fires_on'            // tag → trigger
  | 'listens_for'         // trigger → dataLayer event
  | 'uses_variable'       // tag/trigger → variable
  | 'sends_to'            // tag → server client / GA4 stream / Ads action / Meta event
  | 'routes_to'           // server client → server trigger
  | 'produces_event'      // GA4 stream → GA4 event
  | 'imports'             // GA4 (key) event → Google Ads conversion action
  | 'deduplicates_with'   // Meta Pixel event ⇄ CAPI event
  | 'feeds_custom_conversion' // Meta event → custom conversion
  | 'optimises_for'       // campaign → conversion action / Meta event
  | 'product_link';       // GA4 property ⇄ Google Ads account

interface Link {
  id: string;
  type: LinkType;
  from: string;                   // Entity.id
  to: string;                     // Entity.id
  health: Health;
  evidence: string[];             // why we believe this link exists (e.g. 'tag.config.measurementId = G-…')
  inferred: boolean;              // true if inferred by matching rather than stated in config
  eventKey?: { ns: 'ga4' | 'meta'; name: string }; // event this link carries, if specific
}
```

Lineage (upstream/downstream) is a graph walk over `Link`s, so the tool screens, stack map and dependency-impact view all come from this one structure. Stack-map edges are aggregates of `Link`s grouped by tool pair.

- Each link type has a **data-flow direction**. `sends_to`, `routes_to`, `produces_event`, `imports` and `feeds_custom_conversion` point downstream. `fires_on`, `listens_for`, `uses_variable` and `optimises_for` point at what they depend on, so lineage walks them in reverse. `deduplicates_with` and `product_link` are shown as related, not walked.
- **Event-aware walks:** a server client receives every event, so a naive walk would say every web tag feeds every server tag. Links that carry a specific event have an `eventKey`. Once a walk passes such a link, it only follows links for the same event (or links that carry no specific event).
- Links are **re-inferred from entity config on every scan**, so applying a fix (e.g. adding an `event_id`) really changes the graph.

### 8.3 Layer 3 — Metrics, changes, findings and fixes

```ts
interface MetricPoint {
  entityId: string;               // campaign, conversion action, Meta event…
  date: string;                   // YYYY-MM-DD
  metric: 'spend' | 'impressions' | 'clicks' | 'conversions' | 'conversion_value'
        | 'events_browser' | 'events_server' | 'events_deduplicated' | 'emq';
  value: number;
  dimensions?: Record<string, string>; // e.g. { placement: 'audience_network' }
}

interface ChangeEvent {
  id: string;
  tool: ToolId;
  at: string;
  actor: string;
  kind: 'gtm_publish' | 'config_change' | 'budget_change' | 'bid_change' | 'status_change' | 'fix_applied';
  summary: string;
  entityIds: string[];
  before?: unknown;
  after?: unknown;
}

interface Issue {
  id: string;
  ruleId: string;                 // e.g. 'MT-01'
  category: 'conversion_tracking' | 'cookies_click_ids' | 'consent' | 'configuration' | 'data_quality';
  severity: 'critical' | 'high' | 'medium' | 'low';
  title: string;
  entityIds: string[];
  linkIds: string[];
  evidence: Record<string, unknown>;
  diagnosis: string;              // canned in Phase 1, LLM-generated later
  status: 'open' | 'fix_pending' | 'resolved' | 'dismissed';
  firstDetectedScanId: string;
  resolvedScanId?: string;
  fixId?: string;
}

interface Anomaly {
  id: string;
  type: 'spend_driven' | 'tracking_outage' | 'bot_traffic';
  entityId: string;
  metric: MetricPoint['metric'];
  window: { start: string; end: string };
  baseline: number;
  observed: number;
  changePct: number;
  confidence: number;             // 0–1
  likelyCause: { changeEventIds: string[]; issueIds: string[]; explanation: string };
  recommendation: string;
  status: 'new' | 'acknowledged' | 'expected' | 'resolved';
}

interface FixOperation {
  id: string;
  entityId: string;
  field: string;                  // path within Entity.config
  op: 'set' | 'add' | 'remove';
  from?: unknown;
  to?: unknown;
}

interface Fix {
  id: string;
  issueIds: string[];
  title: string;
  rationale: string;
  risk: 'low' | 'medium' | 'high';
  manualSteps: string[];          // for changes that can't be applied via API
  recommended: FixOperation[];    // original recommendation (never mutated)
  current: FixOperation[];        // edited version
  notes: string;
  status: 'draft' | 'edited' | 'approved' | 'applied' | 'rejected';
  history: { at: string; action: string; by: string }[];
  appliedChangeEventId?: string;
}

interface Scan {
  id: string;
  trigger: 'scheduled' | 'on_demand' | 'change_detected';
  startedAt: string;
  finishedAt: string;
  sources: { source: ToolId; status: 'ok' | 'error'; snapshotId: string }[];
  summary: { newIssues: number; resolvedIssues: number; configChanges: number };
}
```

---

## 9. Phase 2 research: automatic daily data fetching

*This section informs Phase 2. Nothing here is built in Phase 1. API names and limits should be re-verified when Phase 2 starts, because they change often.*

### 9.1 Per-platform access

| Platform | API | Auth | Approvals / gotchas | What we'd pull | How to detect changes (for on-demand refresh) |
|---|---|---|---|---|---|
| **GTM Web & Server** | Tag Manager API v2 | Google OAuth; `tagmanager.readonly` (add edit/publish scopes for applying fixes) | No special approval. Server containers are supported by the same API (including clients). | Live container version: tags, triggers, variables, clients; version headers | Poll the latest version header (cheap) — a new version number = a publish. No webhooks. |
| **GA4** | Analytics Admin API (v1beta, some resources only in v1alpha) for config; **GA4 Data API** for daily aggregates | Google OAuth; `analytics.readonly` (`analytics.edit` for fixes) | No approval. Some resources are alpha and may change. Data API has per-property token quotas — one daily report set is well within them. | Property, data streams, key events, custom dimensions, Google Ads links; daily sessions/engagement by channel and event counts | `searchChangeHistoryEvents` on the account returns config change history |
| **Google Ads** | Google Ads API (GAQL) | Google OAuth + **developer token** (+ `login-customer-id` if accessed via a manager account) | Token levels: Test → **Explorer** (production access, ~2,880 ops/day — enough for one account daily) → Basic (15k/day) → Standard (unlimited). Google reported a review backlog for Basic/Standard applications in Feb 2026, so **apply early**. | `customer` settings (auto-tagging, conversion tracking), `conversion_action`, `campaign` + daily metrics by `segments.date`, conversions by action | `change_event` resource (last 30 days of changes) |
| **Meta** | Marketing API (Graph API) + Conversions API Dataset Quality API | **System user** access token from Business Manager; `ads_read` + `business_management` (`ads_management` for any writes) | For your own business's assets, standard access is usually enough; Advanced Access needs app review. Some Events Manager settings can't be changed via API → manual steps. | Ad account, campaigns, `/insights` daily with placement breakdown, dataset/Pixel config and stats, **event match quality and dedup metrics via the Dataset Quality API**, custom conversions | Ad account `activities` edge (change history) |

### 9.2 Proposed Phase 2 architecture

- **Scheduler:** a daily cron job (Vercel Cron, or Google Cloud Scheduler → Cloud Run if jobs get long) runs a full scan at a fixed off-peak time.
- **Change-triggered refresh:** an hourly lightweight check of the change signals in §9.1 (GTM version header, GA4 change history, Ads `change_event`, Meta `activities`). If something changed, run a targeted scan of just that source.
- **On-demand:** the "Re-scan now" button runs the same scan job immediately.
- **Pipeline per scan:** fetch raw → store `SourceSnapshot` → normalise to the graph (§8.2) → run rules → run anomaly detection → diff against the previous scan → notify.
- **Storage:** Postgres (e.g. Supabase) for the graph, metrics, findings and fixes; object storage for raw snapshots.
- **Secrets:** OAuth refresh tokens and the Meta system-user token encrypted at rest; never sent to the browser.
- **Applying fixes (after approval):**
  - GTM: create a workspace → update entities → create a version → publish (requires edit and publish scopes; the version description holds your notes).
  - GA4: create/update key events, custom dimensions or links via the Admin API.
  - Google Ads: mutate conversion actions and settings via the API.
  - Meta: limited — most Pixel/dataset settings are changed in Events Manager, so these fixes become guided manual steps with a "mark as done" check.
- **LLM:** Claude generates diagnoses and fix recommendations from the rule output plus the relevant subgraph, replacing canned text. The structured `FixOperation` format means its output can be validated before you see it.

### 9.3 Sources

- [Google Ads API — access levels and permissible use](https://developers.google.com/google-ads/api/docs/api-policy/access-levels)
- [Google Ads API — policy page (known issues)](https://developers.google.com/google-ads/api/docs/api-policy)
- [PPC Land — developer token application backlog (Feb 2026)](https://ppc.land/google-faces-developer-token-application-backlog-as-new-api-tier-debuts/)
- [Google Analytics Admin API overview](https://developers.google.com/analytics/devguides/config/)
- [Analytics Admin API v1beta reference (.NET)](https://googleapis.dev/dotnet/Google.Apis.GoogleAnalyticsAdmin.v1beta/latest/api/Google.Apis.GoogleAnalyticsAdmin.v1beta.html)
- [Meta — Dataset Quality API](https://developers.facebook.com/docs/marketing-api/conversions-api/dataset-quality-api)
- [Meta — Dataset Quality API for offline events](https://developers.facebook.com/documentation/ads-commerce/conversions-api/dataset-quality-api/offline-events)

---

## 10. Technical approach (Phase 1)

| Concern | Choice |
|---|---|
| App | React + TypeScript + Vite, single-page app, no backend |
| Styling | Tailwind CSS |
| Stack map | React Flow (`@xyflow/react`) |
| Charts | Recharts |
| State | Zustand, persisted to `localStorage`; "Reset demo" clears it |
| Data | Typed dummy fixtures for each layer of §8, checked with Zod schemas at load |
| Rules & anomalies | Pure TypeScript modules over the normalised graph, so they can move to a backend in Phase 2 unchanged |
| Tests | Vitest unit tests for rules, lineage walks and anomaly classification |
| Hosting | Vercel (static build) |

Code layout keeps a hard boundary between `connectors/` (dummy now, live later), `model/` (types, graph, lineage), `engine/` (rules, anomalies, fix application) and `ui/`.

---

## 11. Acceptance criteria

1. The stack map shows all five tools and their connections, coloured by health, and clicking a node opens that tool's screen.
2. From any conversion on any tool screen (e.g. Meta `Lead`, Google Ads "Quote Request", GA4 `generate_lead`), you can walk the full upstream chain to the dataLayer event and the full downstream chain, clicking through to each entity on its own screen.
3. The Relationships screen lists every link, with filters, the tool-to-tool matrix and dependency impact.
4. All seeded issues in §6.3 appear with evidence, diagnosis, affected lineage and a recommended fix; passing rules appear as passing checks.
5. All seeded anomalies in §7.3 appear on the correct type tab, with a chart, the anomaly window and the linked likely cause.
6. A fix can be edited (change values, remove/add operations, edit notes), validated, approved and applied. After applying, the issue is resolved, the map colours update, a GTM version bump appears where relevant, and the change log records it.
7. "Re-scan now" creates a new scan entry whose summary reflects any fixes applied since the last scan.
8. "Reset demo" restores the original state.
9. The app is deployed on Vercel and usable on desktop; core screens are readable on mobile.

---

## 12. Decisions log

| # | Decision |
|---|---|
| D1 | New private repo `martech-stack-mapper`. |
| D2 | Requirements first, then build. |
| D3 | Automatic (unattended) fixing is out of scope. The diagnose → recommend → edit → approve → apply flow is in, simulated. |
| D4 | Single user, one account per platform. |
| D5 | 100% dummy data. Lead-gen business. |
| D6 | GTM: config only (from container exports in Phase 2). |
| D7 | GA4: config plus daily aggregates for anomaly detection. |
| D8 | Google Ads: all data — campaign performance and conversions. |
| D9 | Meta: Ads, Pixel + CAPI, dedup, event match quality, diagnostics. |
| D10 | Canned diagnoses and recommendations; no live LLM in Phase 1. |
| D11 | Deploy on Vercel with password protection (Basic Auth middleware). |
| D12 | High-level stack map without in-graph drill-down; drill-down lives on per-tool screens. |
