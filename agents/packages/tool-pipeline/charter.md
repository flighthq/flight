---
package: "@flighthq/tool-pipeline"
role: tooling
crate: null
lastDirection: null
review: ./review.md
assessment: ./assessment.md
status: ./status.md
---

# tool-pipeline — Charter

> Durable vision and core values for `@flighthq/tool-pipeline`. You author this (via an agent
> transcribing your direction); it is the rubric `review.md` and `assessment.md` are judged
> against. No status here — that lives in the review. See ../CONTRACT.md.

## What it is

_Descriptive, transcribed from the landed source — not yet direction._

`@flighthq/tool-pipeline` is the build-time asset publisher: it reads a pipeline config, copies the
declared sources into an output directory under content-addressed names, and emits a canonical
manifest describing what it published. It is a server-and-CI tool, invoked as the `tool-pipeline`
binary or called as `buildToolPipeline(options)`, and it produces data the runtime `@flighthq/assets`
layer consumes — it is not part of any runtime path.

The pass is pass-through by design: bytes are hashed (`contentHash`), not transformed. Each manifest
asset carries `id`, `type` (an `AssetType`), `url`, `byteLength`, `contentHash`, and optional
`groups`; the manifest carries `schemaVersion`, pinned by `TOOL_PIPELINE_MANIFEST_SCHEMA_VERSION`.
The exported surface is three functions — `parseToolPipelineConfig`, `buildToolPipeline`,
`runToolPipeline` — split so config parsing, the build, and the CLI shell are each testable alone.

Like every `tool-*` cell it sits outside the `@flighthq/sdk` barrel and is not tree-shakable
(`scripts/sdk-policy.ts` enforces the exclusion), and like its `tool-*` siblings it has no Rust
crate and keeps its own exported types local rather than in `@flighthq/types`.

## North star

_TODO — the durable principles that define "good" for this package; the bar it is held to.
Not yet given; this cell was scaffolded when the package landed so it would stop being invisible
to the generators. Direction is the user's to set._

## Boundaries

_Descriptive, from the landed source._

In scope: reading and validating pipeline config, content-addressed pass-through publishing, and
the canonical manifest that names the result.

Not in scope: transcoding or otherwise rewriting asset bytes, runtime loading (that is
`@flighthq/assets` and `@flighthq/loader`), and any dependency on a browser or a renderer — this
runs in Node, on a server or in CI.

## Decisions

_Append-only, dated, blessed rulings. None recorded yet._

## Open directions

_Gestured-at but undecided; where an agent asks rather than assumes. None recorded yet._
