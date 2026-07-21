# Per-Package Knowledge & Review Architecture

This tree holds the **durable, per-package source of truth** that survives across agent sessions. Each package under `packages/<name>/` has its own folder here: `agents/packages/<name>/`, mirroring the code tree. The goal is a _shared vision that survives visits by different agents_ — a fresh agent reads a package's folder and inherits the intent, the current state, what's approved next, and what the last developer left behind, without having to re-derive any of it.

The design principle, mirrored from the codebase's own architecture (`packages:check` is strict about package _shape_ and silent about package _contents_): **mechanism guards the seams; agents are free inside the prose.** Validation and generation touch only the front matter and the append-only ledgers. The body of every file is unconstrained — that freedom is the whole point of giving each layer its own file.

**Path convention:** paths here and in the per-package files are relative to `agents/` (e.g. `packages/<name>/`).

## The four artifacts

Each package folder holds up to four files. They differ by **writer**, **lifecycle**, and **authority** — which is exactly why they are separate files rather than sections of one document.

| File | Layer | Writer | Lifecycle | Authority |
| --- | --- | --- | --- | --- |
| `charter.md` | vision / core values | you, transcribed by an agent | durable — changes only when _direction_ changes | **highest** — the rubric everything is judged against |
| `review.md` | survey | a review agent (independent observer) | regenerable snapshot, disposable | none — pure observation |
| `assessment.md` | recommendations + approval | an assessment agent over the review | semi-durable; consumed as work lands | medium — `Approved` is blessed, the rest is candidate |
| `status.md` | continuity log | the developer / review pass | append-only, newest on top | informational/transient — unfinished-work tidbits, not blessed truth |

Only `charter.md` is authored from _your_ direction; the other three are produced by agents. Only `charter.md` and the `Approved`/`Decisions` ledgers are append-only and human-gated — everything else regenerates freely.

`status.md` is the **continuity** layer, not "current state" (an agent reads the code for that). It holds the transient unfinished-work tidbits — what's half-done, the gotcha hit, the dangling thread — and is the designated home for the **transient** notes that would otherwise rot as inline `TODO` comments. (Durable semantic comments — ownership, aliasing, allocation, coordinate-space, portability — stay in the code.) An orienting agent defaults to charter + its own code-read and _consults_ status only for dangling threads; storing it does not force anchoring.

### Read order for a fresh agent

1. **`charter.md`** — the vision and the rubric. What this package is _for_.
2. **`status.md`** — what just happened, what's half-done, what to watch.
3. **`assessment.md`** — what's approved to do next, and the candidate backlog.
4. **`review.md`** — the deep survey; read when you need detail behind the assessment.

## The pipeline

```
                  charter.md  ── the fixed star, the rubric ──┐
                                                              │ judged against
  status.md            ─┐                                     ▼
  source + tests       ─┼──►  review.md  ──►  assessment.md  ──►  (your verbal approval)
  prior depth review   ─┘      (survey)        Recommended /        freezes into
                                               Backlog              assessment.md › Approved
                                                                          │
                                                                          ▼
                                                            developer executes, logs status.md
                                                                          │
                                                  a completed item that encodes a permanent
                                                  design ruling is promoted ▲ into charter.md › Decisions
```

1. **Survey** — a review agent ingests the `status.md`, the package source and tests, and writes `review.md`: present capabilities, gaps, and where reality contradicts the charter. The evidence comes from the live worktree. Judged **against the charter** (see the rubric rule below).
2. **Assess** — an assessment agent turns the review into `assessment.md`, sorting work into **`Recommended`** (the actionable, sweep-safe shortlist), **`Backlog`** (parked candidates), and, when needed, **`Depth gaps`** (surveyed domain-maturity gaps that should remain visible in the aggregate queue). Explicit user direction that spans packages or requires staged delivery is recorded under **`Directed`**, keeping it distinct from blanket-sweep work. Anything that still needs a real decision — cross-package work, an API-shape fork — does **not** go in `Recommended`; it is surfaced into the charter's **Open directions** for an explicit conversation.
3. **Approve** — you approve verbally, often coarsely ("do all recommended"). The agent **freezes** the named set into `assessment.md › Approved`, stamped and attributed (see the approval gate).
4. **Execute** — a developer does the approved work and appends a `status.md` entry.
5. **Promote** — a completed item that encodes a permanent ruling is appended to `charter.md › Decisions` on its way out. The charter is the only file an agent never writes to without your blessing.

## The approval gate

Approval is **verbal and often coarse** — given to an agent in conversation, sometimes as "do all recommended items." Two rules make that safe and precise:

- **Freeze, don't reference.** "Do all recommended" is _materialized at approval time_ into an explicit, enumerated list copied into `Approved`. Never record approval as a live pointer to "the recommended list" — if the survey later regenerates, a stale pointer would silently bless items you never saw. The phrase is the input; the frozen, dated list is the record.
- **`Recommended` is the referent, and it must be sweep-safe.** "Do all recommended" means exactly the `Recommended` section — never the `Backlog`, never a design fork. The assessment agent keeps `Recommended` restricted to within-package, non-design-decision work, so blanket approval is always safe. This is the codebase-map autonomy rule (gaps needing a design decision or crossing package boundaries are surfaced, not acted on) applied to the gate.

Every `Approved` entry carries a **provenance stamp** — date plus whether it was `picked` individually or swept in by a `blanket` approval — so a later agent (and you) can tell a deliberate choice from a bulk sweep. Format is fixed in [`CONTRACT.md`](CONTRACT.md).

## The charter is the rubric — with a graceful fallback

`review.md` and `assessment.md` are judged **against `charter.md`**, not against a generic ideal. Where the charter is still a stub (no vision captured yet), the review **falls back** to the codebase-map standard (AAA completeness, the broad feature target, the design constraints) and **flags the silence**: anything the charter does not yet speak to that the reviewer had to assume becomes a candidate **Open direction** for you to settle. The thin-charter case is not a failure mode — it is how the architecture surfaces the questions that turn a stub charter into a real one.

## Prior pipelines (removed)

The `reviews/` tree (depth, breadth, maturation, alignment) and the `tools/agents/proposals/` pipeline were point-in-time staging areas whose findings have been migrated into this `packages/` structure — per-package cells, [`register.md`](register.md), [`structural-forks.md`](structural-forks.md), and [`TODO.md`](TODO.md). Both were removed from the repository on 2026-07-03; their content is recoverable from git history. **The only durable structure is `packages/`.**

Every cell carries a charter and assessment, every built package's cell carries a review (only the chartered-unbuilt candidates have none yet). The generated cross-package view is [`TODO.md`](TODO.md) (via `todo.mjs`) — the one-file index of actionable and surveyed work (chartered-unbuilt packages, the register's ranked candidate queue, and every assessment's `Directed`, `Recommended`, and `Depth gaps` items). **Agents looking for work start at `TODO.md`** and read only the named cell for detail.

## File layout

```
<repo root>/
  agents/packages/
    index.md                    ← this file
    CONTRACT.md                 ← front-matter + ledger contract (what mechanism enforces)
    structural-forks.md         ← SDK-wide cross-cutting forks the per-package charters reference
    register.md                 ← every package's decomposition state (blessed/built-unblessed/recommended)
    scaffold.mjs                ← idempotent generator: creates each package folder + stubs
    todo.mjs                    ← generates TODO.md from cell front matter + assessments + register
    TODO.md                     ← generated one-file index of actionable work (do not edit by hand)
    <name>/
      charter.md                ← durable, you-sourced (seeded from the prior review's domain line)
      status.md                 ← continuity / handoff log
      review.md                 ← generated by the package-review skill
      assessment.md             ← generated by the package-assess skill
```

`review.md` and `assessment.md` are **outputs** — the scaffold does not create stubs for them; the skills write them. The scaffold creates `charter.md` and `status.md` so your status documents have a defined home.

## Mechanism status

Per the staged plan (mechanize what is load-bearing, defer the rest):

- **Built now:** the folder structure + `charter.md`/`status.md` stubs (`scaffold.mjs`), the artifact contract ([`CONTRACT.md`](CONTRACT.md)), the stage-transition skills (**`package-review`**, **`package-assess`**, **`package-direction`**), and the generated views: **`TODO.md`** (the work index) with its **Liveness** section (which stage each stale cell needs next — direction / review / re-review / assess — plus the open-question load per charter), both from `todo.mjs`.
- **Then, when the format settles:** a `docs:packages:check` that validates front matter, folder presence, the append-only ledgers, and the provenance stamp. These touch only the envelope — never the prose.
