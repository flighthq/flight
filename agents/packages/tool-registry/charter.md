---
package: "@flighthq/tool-registry"
role: tooling
crate: null
lastDirection: 2026-08-10
review: ./review.md
assessment: ./assessment.md
status: ./status.md
---

# tool-registry — Charter

> Durable vision and core values for `@flighthq/tool-registry`. You author this (via an agent
> transcribing your direction); it is the rubric `review.md` and `assessment.md` are judged
> against. No status here — that lives in the review. See ../CONTRACT.md.

## What it is

`@flighthq/tool-registry` is the Node command-line shell over registry inventory. It gives developers
an on-demand JSON view of the canonical built-in catalog while keeping host tooling out of the SDK.

## North star

The CLI stays thin and honest about the SDK seam beneath it: argv, output, and exit codes live here;
catalog ownership and resolution policy live in their SDK packages.

## Boundaries

- A `tool-*` package (`crate: null`) with Node argv/stdout/stderr and no SDK barrel export.
- Exposes the generated catalog as JSON on demand.
- Does not emit a registry source module while the output lane remains undecided.
- Does not scan, populate, or migrate existing registrars during the additive stage.

## Decisions

_Append-only, dated, blessed rulings._

- **[2026-08-10] Tooling stops at catalog JSON.** Source generation would encode the unresolved
  ownership lane; rejecting that command is part of the additive-stage boundary.

## Open directions

The source-emission command and its file-writing contract wait for the ownership-lane ruling.
