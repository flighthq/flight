---
name: package-review
description: >-
  Survey one Flight package and write its review.md — the independent observation layer of the per-package knowledge tree under agents/packages/<name>/. Reads the package's live source, tests, and status.md, and reasons against its charter.md and the contract (falling back to the codebase-map AAA standard where the charter is silent). Surfaces both how well the package lives up to the contract and where the contract/admin docs themselves need revising. Use when asked to "review a package", "survey <package>", "ingest the status docs", or to (re)generate review.md before assessment/approval. Read agents/packages/index.md first.
---

# Package Review

You are the **survey layer**. Your output is `agents/packages/<name>/review.md`: a clear, honest observation of where the package is. You **observe**; you do not decide what to do next (that is the assessment layer) and you do not set vision (that is the charter). Read `agents/packages/index.md` and `CONTRACT.md` once before starting.

## Inputs to ingest

Read all of these before writing a word:

1. **`agents/packages/<name>/charter.md`** — the rubric. The vision, North star, Boundaries, Decisions, and Open directions. This is what you judge the package _against_.
2. **the status doc** — `agents/packages/<name>/status.md`. The developer handoff: what was just changed, what is in-flight, what to watch. A primary signal, not gospel — verify its claims against the source.
3. **the source** — `packages/<name>/src/`, plus colocated `*.test.ts`. Ground every claim here.
4. **`agents/packages/CONTRACT.md`** and **`index.md`** — the artifact contract and architecture. You judge the package against the charter _and_ against these.

## The rubric rule

Judge the package **against its charter**, not a generic ideal.

- Where the charter **speaks** (a North-star principle, a Boundary, a Decision): measure the package against that, and call out any place the code **contradicts** the charter — that is the highest-value finding a review can produce.
- Where the charter is **silent or a stub**: fall back to the codebase-map standard — AAA completeness for the domain, the OpenFL/Lime feature target, and the design constraints in `agents/index.md`. Then **flag the silence**: each thing you had to assume because the charter did not say becomes a **candidate Open direction** (collected in a closing section), so a thin charter gets thicker over time. Do not invent vision — surface the question.

## What review.md contains

Write the file with the front matter from `CONTRACT.md` (`package`, `status` from `stub|partial|solid|authoritative`, `score` 0-100 directional, `updated`, `ingested`), then prose — structure it for the domain, but cover:

- **Verdict** — one line: `<status> — <score>/100`, and a sentence of why.
- **Present capabilities** — what genuinely exists, grounded in source. Be specific (function names, files). This is the evidence base the assessment will reason over.
- **Gaps** — what a mature library in this domain has that this one lacks. Name them concretely; do not yet prescribe the fix or sequence it (that is the assessor's job).
- **Charter contradictions** — anywhere the code violates a stated North-star principle, Boundary, or Decision. Empty is a fine and good result; say so.
- **Contract & docs fit** — two directions: (a) how well the package lives up to the contract — `@flighthq/types`-first types, full unabbreviated names, `out`-params, sentinels-not-throws, single root export, `sideEffects: false`, Rust-crate mirror; and (b) where the _contract or admin docs themselves_ are wrong or stale against the shape the work has taken — a Package Map line that no longer matches, a convention the package outgrew, a missing entry. Flag these as **candidate revisions**; acting on them is the user's gate, not yours.
- **Candidate open directions** — questions the charter does not answer that you had to assume to review. These feed the charter's Open directions for the user to settle.

## Boundaries of this skill

- **Do not** write `assessment.md` (Recommended/Backlog/Approved), edit `charter.md`, or touch `status.md`. You produce exactly one file: `review.md`.
- **Do not** prescribe a Bronze/Silver/Gold plan or sequence work — observation only. The assessment layer turns your gaps into recommendations.
- Ground every claim in source. A review that cannot be traced to code or tests is worthless to the layers downstream.
