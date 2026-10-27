# Martech Stack Mapper — UX design

**Status:** Built in the prototype · **Date:** 2026-10-27 · **Owner:** Malik Ahmad

This explains how the prototype's interface is organised, why, and how the AI assistant fits in. It supersedes the screen list in [REQUIREMENTS.md §5](REQUIREMENTS.md#5-screens) where they differ.

---

## 1. Who it's for

| | Client | Consultant |
|---|---|---|
| Who | Marketing manager at the business (in the demo: Jamie, BrightPath Solar) | Tracking specialist at the agency (in the demo: Sam) |
| Wants to know | "Are my conversions being tracked? What's broken, and does it matter?" | "Exactly what is misconfigured, where in the chain, and what changed?" |
| Should be able to | Monitor health, understand problems in business terms, apply low-risk fixes, ask for help | See every ID, rule, config value and lineage step; edit, approve and apply any fix |
| Starts in | **Simple** view | **Detailed** view |

The demo has a role switch (avatar menu, top right) so both experiences can be shown from one login.

## 2. Research summary

| Source | Lesson | How it shows up here |
|---|---|---|
| Progressive disclosure ([Nielsen](https://jakobnielsenphd.substack.com/p/progressive-disclosure), [IxDF](https://ixdf.org/literature/topics/progressive-disclosure)) | Show the essentials first and keep advanced detail one click away. Novices make fewer errors; experts pay one click. Don't hide things so deep they can't be found. | One interface for both roles. Every detail view has a **Technical details** section: collapsed in Simple, open in Detailed. |
| Linear ([design refresh](https://linear.app/now/behind-the-latest-design-refresh)) | Be opinionated; not everything deserves equal visual weight; the command palette is the power-user interface. | One home page with one question. Severity in plain words. **⌘K** jumps to any problem, conversion, tag, event or page. |
| Sentry issue page and Seer ([RCA docs](https://docs.sentry.io/product/ai-in-sentry/seer/root-cause-analysis/)) | The issue is the unit of work: summary first, evidence linked to the conclusion, agent reasoning visible. | **Problems** merge issues, anomalies and fixes. Each opens with what's happening, then the evidence chart, the likely cause and the fix. The assistant shows its steps. |
| Cursor @-mentions and context chips ([docs](https://cursor.com/docs/context/mentions), [pattern](https://aiuxplayground.com/pattern/context-chip-management)) | Attached context must be visible and removable. Anti-patterns: invisible attachments, silent truncation. | Context appears as chips above the input. Clicking a chip shows **exactly what will be sent** (JSON plus a token estimate). `@` searches for context. The reply says when it only looked at the first 4 items. |
| AI sidebar placement ([Amplitude test](https://www.amplitude.com/blog/ai-chat-box-tests.md), [Datadog Bits](https://docs.datadoghq.com/bits_ai/bits_chat/), [Composite](https://composite.com/blog/sidebar-beats-spotlight-ai-pattern)) | A persistent sidebar beat a corner icon by 16.6%, but users hated it reopening after they closed it. Datadog opens beside the current page with ⌘I. | The assistant is a right-hand panel (⌘I). Its open/closed state is remembered per person. Drawers stop at its edge so you can keep chatting about what you're looking at. |
| Segment tracking plan ([Protocols](https://www.twilio.com/docs/segment/protocols.md)) | A plain-language plan of what each event means bridges marketers and engineers. | A per-client **conversion plan** maps each business conversion to its name on every platform. The home grid is built from it. |

## 3. Principles

1. **Start from the business question, not the system.** The home page answers "is each conversion reaching each platform?" Tools, tags and links are one level down.
2. **One problem, one place.** The engine reports a fault several ways (a rule issue, the anomalies it caused, a recommended fix). The UI folds them into one **Problem** with a plain headline.
3. **Same screens, different depth.** Simple and Detailed show the same layout and navigation; only the default disclosure changes. A client and a consultant can look at the same screen on a call.
4. **Plain words first, exact words available.** "Meta is double counting leads" leads; `MT-01 · Meta "Lead" is double counted: Pixel sends no event_id` sits underneath in Detailed view.
5. **Everything is selectable for the AI.** Problems, tags, events, conversions, config changes, table rows and chart date ranges can all be handed to the assistant.
6. **The AI suggests; people apply.** The assistant can explain, trace, compare and draft. Its actions only navigate or add context, and every change goes through the fix workflow.

## 4. Information architecture

```
Overview (home)            Status banner · conversion grid · fix these first · unusual activity · recent changes
Problems                   List (Open / In review / Closed) + detail, side by side
Explore the stack
  Stack map                Tool-level graph (unchanged)
  Relationships            Every link, matrix, impact (unchanged)
Tools                      Website, GTM Web, GTM Server, GA4, Google Ads, Meta
Scans & history            Change history across tools · sources · scan history
```

Old routes (`/issues`, `/anomalies`, `/fixes`, with or without `?id=`) redirect to the matching problem.

### Overview

- **Status banner:** one sentence (e.g. "3 urgent problems are affecting your conversion tracking"). It shows how many problems the client can fix themselves; for a consultant, how many reviews are waiting.
- **Conversion grid:** rows are business conversions, columns are GA4, Google Ads and Meta. Each cell shows a status (Tracking / Needs attention / Broken / Fixed — confirming / Not tracked), last-7-days count vs a typical week, and a 30-day sparkline.
  - A cell is **Broken** only when an urgent or important problem changes that platform's numbers. A consent problem upstream makes it "Needs attention", not "Broken".
  - Clicking a cell opens how the data travels (Website → GTM Web → GTM Server → platform), with the failing hop highlighted.
- **Fix these first:** the top four problems, with a **Fix it** button when the viewer can apply the fix themselves.

### Problems

- Grouped by plain severity: **Urgent** (critical), **Important** (high), **Worth fixing** (medium), **Minor** (low). Budget-driven changes sit under **Explained changes · no action needed**.
- Detail order: what's happening → impact chart (with the change that caused it marked) → likely cause → **How to fix it** → Technical details (check, diagnosis, evidence, affected entities, lineage, editable diff, fix history).

### Fix permissions

| | Low-risk fix | Medium / high-risk fix |
|---|---|---|
| Client | **Apply fix** (approve and apply in one confirmed step), or ask the consultant first | **Request review**, with an optional note. Once a consultant approves, the client can apply it. |
| Consultant | Edit, approve, apply | Edit, approve, apply. Client requests appear under **To review**. |

Only consultants can edit the proposed values. Every action is recorded against the person who took it.

## 5. The AI assistant

### Giving it context

| Where | How |
|---|---|
| Any problem, entity drawer or conversion | **Ask AI** button |
| Tool tables, problem list | Tick rows → **Add to chat** in the floating bar |
| Any chart with daily data | Drag across a date range → **Ask about Oct 12 – Oct 20** |
| Change history, likely cause, affected entities | Small add-to-chat icon on hover |
| ⌘K palette | ⌘Enter adds the highlighted item instead of opening it |
| Assistant input | `@` to search, or **Add context** |

Each item resolves to a structured payload (see `src/assistant/context.ts`): config and lineage for an entity; daily rows for a date range; diagnosis, evidence, anomalies and the proposed diff for a problem. The composer shows a token estimate and the exact JSON. Follow-up questions reuse the previous message's context.

### Replies (Phase 1)

Replies are **scripted, not generated** (decision D10). `src/assistant/respond.ts` recognises about ten intents and builds each answer from the current demo data, so answers stay true after fixes are applied. Intents include explain, impact, how to fix, why/cause, lineage, compare, config check, what needs attention, what changed, and status update. Replies come with action buttons (open a problem, review the fix, add a related change).

Answers also adapt to the viewer's role. For example, a client asking "How do I fix it?" about a medium-risk fix is told it needs a consultant's approval.

### Phase 2: a real model

Swap `respond()` for a call to Claude, sending the user's message, the resolved context payloads (already built for the preview), the role, and a system prompt describing the stack. Expose the same capabilities as tools: look up an entity, walk lineage, query daily metrics, list changes, and draft a fix as `FixOperation[]`, validated by `validateOperations`. Drafted fixes go into the fix workflow; the model never applies them.

## 6. Not done yet

- Mobile layout (desktop only for now).
- Multi-client portfolio for consultants. The conversion plan and role model are per client, so a client switcher can be added later.
- Notifications (e.g. telling the consultant when a review is requested) — the request is recorded and shown in-app only.
