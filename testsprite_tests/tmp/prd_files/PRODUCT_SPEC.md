# SquashBa — Product Specification Document

> **Status:** Living document · **Audience:** Product, engineering, design, and stakeholders
> **Last reviewed:** 2026-06-02
> **Platform:** Mobile-first Progressive Web App (PWA)

---

## 1. Overview

**SquashBa** is the digital home of the squash community of Bahia, Brazil. It combines two products into a single mobile-first PWA:

1. **A social network** for players, coaches, clubs, and fans — directory, profiles, rankings, messaging, and a community feed of what's happening now.
2. **A tournament & match-management platform** — create and run championships and challenges in any common squash format, score matches live (even with no internet on court), and publish standings and brackets automatically.

The product exists to centralize a sport that today lives in scattered WhatsApp groups, spreadsheets, and paper brackets. It gives organizers a tool to run real competitions, gives players a profile and a ranking that follow them across events, and gives the whole scene a shared place to find each other, find coaches, and find gear.

### One-sentence pitch

> *The app where the Bahia squash community plays, competes, and connects — with live scoring that works even when the court has no signal.*

---

## 2. Purpose & Vision

### Problem

- Squash in Bahia has an active but **fragmented** community. Tournament results, player contacts, coach availability, and event news are spread across informal channels.
- Running a tournament (league, groups + knockout, single elimination) requires **manual bracket math, standings calculation, and tiebreaker bookkeeping** — error-prone and slow.
- Courts frequently have **poor or no connectivity**, so any scoring tool that assumes a live connection fails exactly when it's needed.

### Vision

A single, trusted, beautiful app that:

- Makes it trivial for an organizer to spin up a competition in any format and let it run itself (brackets advance, standings recompute, the championship closes when the last match is done).
- Lets **anyone involved in a match** record the score — on or off the internet — and reconciles everything safely when connectivity returns.
- Becomes the **default identity layer** for squash players in the region: your profile, your category, your ranking, your match history.
- Surfaces the **commercial side** of the community responsibly — coaches and local product/service providers — without turning into an ad platform.

### Success looks like

- Organizers run entire tournaments end-to-end inside the app with zero spreadsheets.
- Players install the PWA, complete onboarding, and return to check rankings and reminders.
- Matches are scored courtside reliably, including offline, with no lost data and no double-entry.

---

## 3. Target Users & Roles

The product has three system roles (`app_role` enum: `player`, `organizer`, `admin`) plus distinct *contextual* permissions per competition.

| Role | Who they are | Core capabilities |
|------|--------------|-------------------|
| **Player** (default) | Any registered community member | Complete profile, appear in community & rankings, accept/decline invites, message others, score matches **they participate in**, create challenges, view championships/standings/brackets. |
| **Organizer** ("Professor") | Coaches and event runners, **approved by an admin** | Everything a player can, plus: create and manage championships in all formats, manage categories/venues/teams, declare W.O., finalize/reopen any match in competitions they manage, appear as a "Professor" in the directory and marketplace. |
| **Admin** | Platform operators | Full control: approve/reject organizer requests, manage all users and roles, manage marketplace ads, sponsor banners, and review user feedback. |

### Contextual permissions (independent of global role)

Even a plain **player** gains management rights **scoped to a single match** when they are a participant in it:

- Record the score of their own match.
- Finalize their own match (including disqualification / interrupted).
- Declare W.O. in a competition they're part of.
- Reopen their own match.

This is the central UX decision of the platform: **"everyone involved in the competition can use the app and fill in results."** Organizers are not a bottleneck.

### Personas

- **Rafael, the coach/organizer.** Runs a monthly club league and an annual open. Needs fast tournament setup, automatic standings, and the ability to delegate scoring to players so he isn't typing every result.
- **Marina, the competitive player.** Plays in two categories. Wants her ranking, her match history, invites, and a way to message opponents to schedule games.
- **The admin/operator.** Keeps the community healthy: approves coaches, curates the marketplace, manages sponsors, and triages feedback.

---

## 4. Goals & Non-Goals

### Goals

1. Support the **four real-world squash competition formats** with correct, automated rules.
2. **Offline-first scoring and creation** — the app must be fully usable courtside without a connection and reconcile cleanly afterwards.
3. **Frictionless delegation** — any participant can keep score; the organizer supervises rather than executes.
4. A **distinctive, polished mobile UI** (glassmorphism, navy + neon green brand) that feels like a product, not a form.
5. **Trustworthy data** — Row-Level Security on every table; scores can't be falsified by non-participants; conflicts are surfaced, never silently overwritten.
6. **LGPD-aware** identity handling (Brazil's data protection law), including minors' guardian consent.

### Non-Goals (current scope)

- Not a live-streaming or video platform.
- Not a payments/booking system (court reservations, entry fees) — contact happens off-platform via phone/email/WhatsApp links.
- Not a general-purpose marketplace with transactions — the marketplace is a **directory** of coaches and local providers with contact info only.
- Not a multi-sport platform — it is squash-specific by design.

---

## 5. Technology & Architecture

| Layer | Choice |
|-------|--------|
| Framework | **Next.js 16** (App Router, React Server Components, Server Actions) |
| Language | **TypeScript**, **React 19** |
| Styling | **Tailwind CSS v4** (design tokens via `@theme`), custom glassmorphism utilities |
| Backend | **Supabase** — PostgreSQL, Row-Level Security, Auth, Storage, Realtime |
| Offline | **IndexedDB** (`idb-keyval`) outbox + custom sync engine; **Serwist** service worker |
| PWA | Web App Manifest, service worker, installable, standalone, web push |
| Fonts / Icons | **Sora** (display) + **Inter** (body); **lucide-react** icons |
| Hosting | **Vercel** |

### Architectural principles

- **Server-first data fetching.** Pages are Server Components that fetch via the SSR Supabase client (validated `getUser()`), parallelizing independent queries with `Promise.all` and resolving dependent lookups in phases.
- **Security in the database.** RLS is the backstop on every table; privileged transitions (finalize match, declare W.O., advance bracket, respond to invite) run through `security definer` RPCs that enforce permission checks centrally. Auth functions are wrapped as `(select auth.uid())` and RLS columns are indexed for performance.
- **Triggers own the rules.** The competition engine lives in Postgres: activating a championship generates its matches/bracket; finalizing a match advances the bracket; finalizing the last match auto-closes the championship. The client never recomputes authoritative state online.
- **Offline mirrors the server.** A client-side engine (`lib/standings/compute.ts`, `lib/offline/local-championship.ts`) faithfully **ports** the server's match-resolution and standings logic so that offline play shows the same results the server will later confirm.

---

## 6. Feature Specification

### 6.1 Onboarding & Identity

**Purpose:** Establish a real, usable identity for every member and stay compliant with LGPD.

**How it works:**
- New users sign up (Supabase Auth, email/password). A database trigger auto-creates a `profile`, a `profiles_private` row (phone/email, owner-and-admin-readable only), and a default `player` role.
- First login routes to **onboarding**, which collects: full name, birth date, gender, phone, optional **category** and **team**, and an **avatar** (compressed client-side before upload to a public Storage bucket).
- **Consent:** an explicit LGPD consent checkbox. If the birth date indicates the user is **under 18**, an additional **guardian consent** is required.
- Until `onboarding_completed` is true, the app redirects back to onboarding.

**Profile management:** users can edit their profile and change their password; account **deletion** is supported (privacy/LGPD). A dedicated privacy policy page exists.

### 6.2 Organizer (Coach) Access

**Purpose:** Gate competition-creation power behind a human review while letting any player request it.

**How it works:**
- A player submits an **organizer request**. Status flows `pending → approved | rejected`, reviewed by an admin in the admin panel.
- Approved users gain the `organizer` role, appear as **"Professor"** in the community directory and the marketplace, and can create/manage competitions.

### 6.3 Championships Engine

**Purpose:** Let organizers run real squash competitions in any standard format with rules enforced automatically.

**Formats** (`championship_format`):

| Format | Description |
|--------|-------------|
| **Liga** | Round-robin / points league. Configurable rounds; everyone plays everyone. |
| **Grupos + Eliminatória** | Group stage (snake-draft seeding) → knockout bracket of qualifiers. Two configurable stages. |
| **Eliminatória** | Single-elimination bracket with seeds; optional 3rd-place match. |
| **Desafio** | Challenge — see §6.5. |

**Confrontation units** (`confront_unit`): **player** (singles), **pair** (doubles), **team** (N-vs-N).

**Stage configuration** (each stage carries its own counting system):
- **Counting:** `set` (best-of-N sets) or `tempo` (timed game).
- **Sets to play:** 1, 3, or 5 → **MD1 / MD3 / MD5** ("melhor de").
  - **MD3:** first side to **2** sets wins. **MD5:** first side to **3** sets wins. The match must terminate the moment the decision is reached — no unnecessary extra set.
- **Points per set** (default 11), **win-by-two** toggle, optional **set draw** variant (e.g. 11×11 counts as a tie), and **time in minutes** for timed games.
- **Scoring & tiebreakers:** configurable points for win/draw/loss; configurable, ordered tiebreakers (`sets_ganhos`, `pontos_ganhos`, `pontos_sofridos_asc`).

**Lifecycle** (`status`): `rascunho` (draft) → `ativo` (active) → `encerrado` (closed).
- Activating generates matches/bracket via triggers (league pairings, group matches, or seeded bracket).
- Going back to draft is blocked once any match has been played.
- When **every match is finalized**, the championship **auto-closes** (a late-ordered trigger that fires after bracket advancement).

**Views & outputs:** live **standings tables** (with configured tiebreakers), **group tables**, **bracket views**, and **stats** per participant/team. A championship can be edited, and matches can be scheduled (date/time and court).

### 6.4 Matches & Live Scoring

**Purpose:** Record results reliably, courtside, by whoever is running that specific match — online or offline.

**Match model:** every match has two sides (A/B) referencing participants, an optional court and schedule, a `status` (`agendado` → `em_andamento` → `finalizado`, plus `revisao` for conflicts), and a `result` (`lado_a` / `lado_b` / `empate`). Per-set scores live in `match_games`.

**The scoring screen:**
- Tap to **increment/decrement** each side's points.
- **"Encerrar set e avançar"** (close set & advance) appears **only when the current set is actually decided** (per points-per-set + win-by-two), preventing phantom extra sets in MD3/MD5.
- **Timed games** use a court timer instead of sets.
- **"Resultado final"** highlights the winner.

**Universal "Encerrar partida" (finish match) button** — available to organizers **and** participants — opens a modal with:
1. **Player/Side A disqualified** → other side wins.
2. **Player/Side B disqualified** → other side wins.
3. **Match interrupted with partial score** → finalize using the score on the board.

**W.O. (walkover):** any member of an open competition can declare a walkover. The winner gets the win/loss record, **but the match contributes no sets or rally points** to statistics (enforced in the stats view).

**Permissions in scoring:**
- Organizers use the manual/admin finalize and W.O. RPCs.
- Participants use the **by-participant** RPCs (`finalize_match_by_participant`, `finalize_match_wo_by_participant`, `reopen_match_by_participant`) which check `participant_members` instead of organizer rights.
- **Reopen match** is available to organizers (any match they manage) and to participants (their own match). Reopening a match that auto-closed its championship also reopens the championship.

**Immediate feedback:** on finishing, the UI **optimistically** dims the scoreboard and shows the winner instantly, rather than waiting for the realtime round-trip.

### 6.5 Challenges (Desafios)

**Purpose:** Lightweight head-to-head competitions between two players, two pairs, or two teams — with an invite/accept flow.

**Variants:** **1v1**, **doubles (2v2)**, **team (N-vs-N)** with an optional **final** between each team's top performer.

**Invite flow:** the creator invites the opponent; the opponent **accepts or declines**. Accepting activates the challenge (and generates matches via trigger); declining closes it. Pending invites and responses appear as **reminders** on the home screen.

**Series scoring:** challenges are best-of-N rounds. Because **sides alternate between rounds** (the same player is "side A" in round 1 and "side B" in round 2), the series score is counted **by participant identity** (matching `side_a/side_b_participant_id` to the result), never by board position — so a player who wins both rounds correctly shows **2–0**, not 1–1.

### 6.6 Offline-First Behavior

**Purpose:** The app must be fully functional on a court with no signal — this is a defining requirement, not a nice-to-have.

**Capabilities offline:**
- **Create** championships and challenges. Each creation is captured as a self-contained, re-runnable **outbox operation** (in IndexedDB) and rendered immediately as a **provisional/pending** item.
- **Score** matches with a local score engine; a **local championship model** computes brackets and group standings on-device, mirroring server logic.
- **Live standings** recompute locally from queued scores.

**Sync engine:**
- A background sync (interval + online/offline events) **flushes** queued actions when connectivity returns; pending counts are surfaced in the UI.
- Created items reconcile in order; the real server ID is stored so retries don't duplicate.
- Routes are **pre-cached**; a dedicated offline page is served when needed.

**Conflict resolution:** if a match's server state diverges from local queued changes, the match enters **`revisao`** status. The user is shown both snapshots and explicitly chooses **local** or **server** — the system never silently overwrites.

### 6.7 Messaging

**Purpose:** Let the community coordinate (schedule matches, talk shop) without leaving the app.

- **Direct 1:1 conversations** (idempotently created on demand).
- **Championship group chats**, auto-created when a championship is activated, with all confirmed participants as members.
- **Realtime** delivery, **unread badges** (in the bottom nav and home reminders), and **web push** notifications via stored push subscriptions.

### 6.8 Community Directory

**Purpose:** Make the scene discoverable — find players, coaches, opponents.

- Searchable **player directory** (by name), filterable **by category**.
- **"Professor"** badge for organizers/coaches.
- Tappable **player profile** pages; a **Message** button to start a direct conversation.

### 6.9 Home (Início)

**Purpose:** A personalized landing surface that answers "what should I care about right now?"

Composed, animated sections:
1. **Welcome header** — gender-aware greeting; **birthday** recognition.
2. **PWA install banner.**
3. **Reminders (Lembretes)** — unread messages, championship invites, challenge invites, responses to challenges you sent, and your active-competition count.
4. **Sponsor banner carousel** (images from Storage, optional click-through links).
5. **"Acontecendo agora"** — live (in-progress) matches and active championships/challenges.
6. **Teachers (Professores)** — the coaches in the community.
7. **Category rankings** — leaderboards per category (points / wins / games played), via a dedicated ranking RPC.

### 6.10 Marketplace

**Purpose:** Surface the commercial ecosystem (coaching, gear, services) as a curated directory.

- **Professores** section (coaches).
- **Products & Services** ads (admin-managed): name, product/service, and contact (phone `tel:`, email `mailto:`, address). Ads are ordered and toggleable (`active`).

### 6.11 Management (Gestão) — Organizers/Admins

**Purpose:** Maintain the shared catalog that competitions and profiles draw from.

- **Categories** (player categories used for rankings and filters).
- **Venues (Locais)** and their **courts**.
- **Teams.**

### 6.12 Admin Panel

**Purpose:** Platform operations and governance.

- **User management** — list all users with **name + email** and roles; searchable by name or email.
- **Organizer requests** — approve / reject.
- **Marketplace ads** — create/edit/order/activate.
- **Sponsor banners** — manage click-through links.
- **Feedback** — review user-submitted feedback.

### 6.13 Feedback & Versioning

- Any user can submit **feedback** from the Help (Ajuda) area.
- A **"Beta" version badge** links to a **changelog** page generated from git history at build time (commit count + history), giving the community visible, honest release progress.

---

## 7. Data Model (high level)

Core tables and relationships (all under PostgreSQL Row-Level Security):

- **Identity:** `profiles`, `profiles_private`, `user_roles`, `organizer_requests`.
- **Catalog:** `categories`, `venues` → `courts`, `teams`.
- **Competition:** `championships` → `championship_stages` → (`groups`, `championship_teams`); `participants` → `participant_members`; `matches` → `match_games`.
- **Messaging:** `conversations` → `conversation_members`, `messages`; `push_subscriptions`.
- **Commerce/content:** `ads`, `sponsor_banners` (+ Storage `sponsors` bucket), `feedbacks`.

**Key enums:** `app_role`, `genero`, `championship_format`, `confront_unit`, `counting_system`, `match_status`, `match_result`, `participant_kind`.

**Notable derived data:** participant/team statistics views (W/L, sets, rally points — W.O.-aware), standings RPC with configurable tiebreakers, and category-ranking RPC.

---

## 8. Permissions & Security Model

- **Authentication:** server-side gating always uses validated `auth.getUser()` (never cookie-only session checks). Unauthenticated users are redirected to login; users without completed onboarding are redirected to onboarding.
- **Authorization:** RLS on every table — public read where appropriate (profiles, catalog, competitions are publicly viewable), owner-only writes for personal data, and **organizer/admin or participant** writes for competition data.
- **Privileged operations** run through `security definer` RPCs with explicit checks: `can_manage_championship` (organizer/admin) **or** `participant_members` membership for participant-scoped actions.
- **Private data** (phone/email in `profiles_private`) is readable only by the owner and admins.
- **Performance:** RLS auth calls are wrapped in `(select …)`; columns used in policies are indexed.

---

## 9. Design System & UX Principles

**Brand identity:**

| Token | Value | Use |
|-------|-------|-----|
| `--color-primary` | `#1d2b45` | Base navy background |
| `--color-secondary` | `#cdfd51` | Neon-green accent — CTAs, active state |
| `--color-surface` | `#2c3b58` | Cards |
| `--color-neutral` | `#3c4b66` | Borders / secondary surfaces |
| `--font-display` | **Sora** | Headlines |
| `--font-sans` | **Inter** | Body |

**Glassmorphism:** a reusable `.glass` system (gradient tint + sheen + defined border, radius 24px cards / pill 999px). Heavy `backdrop-filter` blur is applied **only** to true overlays (`.glass-overlay`, e.g. the floating bottom nav) — not to in-flow cards — for scroll performance on mobile. A fixed gradient background via `body::before` avoids per-frame repaint.

**Layout & navigation:**
- **Mobile-first:** a 480px content frame with a sticky **TopBar** (logo, animated search, avatar menu) and a floating glass **BottomNav** (Início, Campeonatos, Marketplace, Comunidade, Mensagens, Ajuda) with an unread badge.
- **Landscape phones:** the bottom nav becomes a side rail (`landscape-sm` variant) to free vertical space.
- **Desktop:** a left sidebar replaces the mobile chrome; content centers in a readable column.

**Motion:** CSS-only staggered reveals on the home feed, a live-dot pulse, and tactile `active:scale` feedback — all respecting `prefers-reduced-motion`.

**Optimistic UI:** state-changing actions (scoring, finishing a match) reflect immediately, with realtime/sync confirming in the background.

---

## 10. Non-Functional Requirements

- **Offline resilience:** zero data loss on connectivity drops; deterministic reconciliation; explicit conflict resolution.
- **Performance:** server-side parallel data fetching; indexed RLS; restrained use of expensive paint effects (blur only where it overlaps content).
- **Installability:** standalone PWA, portrait orientation, branded icons (including maskable), themed splash.
- **Accessibility:** semantic roles, `aria-current`/`aria-label` on navigation, reduced-motion support, high-contrast neon-on-navy palette.
- **Compliance (LGPD):** explicit consent, minors' guardian consent, private contact data isolation, and account deletion.
- **Localization:** Portuguese (pt-BR) throughout.

---

## 11. Out of Scope / Future Considerations

- Payments, entry fees, and court booking.
- In-app transactions in the marketplace (remains a contact directory).
- Native iOS/Android apps (the PWA is the delivery vehicle).
- Multi-region / multi-sport expansion (the product is intentionally squash-Bahia-focused).
- Possible future enhancements: richer player stats/history pages, automated scheduling, public shareable tournament pages, and notification preferences.

---

*This document describes the intended product behavior. Where implementation and this document diverge, treat the divergence as a bug in one or the other and reconcile.*
