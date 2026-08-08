---
package: '@flighthq/swf'
updated: 2026-08-08
---

# Conformance core generality — what a format-agnostic core may not assume

**Read this before extracting anything from the SWF conformance scoreboard into a shared core.** No
such core exists. This document records a constraint on one that does not, derived by attempting to
scope a second format against it, and it is here because a constraint discovered at a boundary is
re-derived expensively once the boundary is out of view.

## The finding

Scoping MD5 as a second conformance format produced a falsifier rather than an estimate:

> If the core owns raw capability extraction, **or assumes one file equals one case**, it is general
> only over SWF-like tag streams.

MD5 falsifies both halves.

**Raw capability extraction is format-grammar work, not core work.** SWF's numeric tag IDs yield
per-file capability witnesses directly, so extraction looks like something a core could own. MD5 has
no tag stream — it is line-oriented text with declaration/section structure, and reconciling declared
counts against `joints`/`mesh` or `hierarchy`/`baseframe`/`frame` needs a lexer and a state machine.
The two probes share no mechanism.

**One file does not equal one case.** An MD5 mesh imports alone, but an animation's meaningful path
requires a compatible mesh skeleton — so a case is a *set* of files with a case hash over its members.
The current core carries one reference, one `sourceHash`, and one worker input per case.

## Why it is recorded rather than remembered

**The one-file-equals-one-case assumption was invisible while SWF was the only instantiation.** It does
not appear as a decision anywhere; it appears as plumbing. A single instantiation cannot show which of
its properties were assumed, which is the entire argument for scoping a hostile second format *before*
building the abstraction rather than after.

⇒ **A sound core accepts adapter-produced cases.** The reusable algorithms begin *after* an adapter has
produced logical cases, independent capability evidence, and observations — scoring, sharding, caching,
and the artifact schema can be general. Extraction and grouping cannot. SWF's tag walker and MD5's
section probe stay separate instantiations.

## Population, and the naming prohibition it carries

The MD5 material available for this work is **13 files from one asset family** — one mesh and twelve
animations, all one rig. Thirteen is a count; the population is **one**.

⇒ **A corpus of population 1 cannot support a breadth claim, so a name that implies breadth
manufactures the claim the evidence cannot carry.** Whatever gets built later and whoever builds it, an
MD5 smoke lane is a smoke lane and is never called a conformance scoreboard. This holds independently
of the scoping decision, which is why it is here rather than in the decision record.

## "The core" names two deliverables — price the boundary, not the phrase

Two independent estimates of a format-agnostic core came back at **7–12 days** and **3–5 days**, and
**neither was wrong.** They priced different deliverables:

| Boundary | Contents | Estimate |
| --- | --- | --- |
| **Core only** | Extract the case/score/shard/cache layer; **SWF probe, worker and index stay adapters**; no second end-to-end lane | **3–5 days** (3–4 plausible) |
| **Core plus a second lane** | The above, plus shared multi-pack CLI/worker orchestration, a second probe/classifier/evidence policy, and an end-to-end format lane | **7–12 days** |

⇒ **An error gets corrected once; an ambiguous name keeps producing a wrong number every time anyone
prices it.** Whoever quotes this work states which boundary the number buys, in the same sentence as the
number. The larger reading is a legitimate reading — pricing it is not carelessness.

## Verified inventory — what is genuinely coupled to SWF

Independently checked against the tree. Cited by file and symbol so each line can be re-derived.

**Genuine coupling, must be generalised.**

1. **CLI and orchestration** are fixed to `swf-ruffle-fixtures`/full —
   `import-conformance-process.ts::{ImportConformanceExhaustiveArguments, ImportConformanceSubsetArguments, parseImportConformanceArguments, PACK_ID}`;
   `import-conformance.ts::{runImportConformanceProcess, findFixtureTree, readCapabilityDefinitions, readInstrumentationMapping, PACK_ID, PACK_VARIANT, CAPABILITY_PATH, INSTRUMENTATION_PATH}`.
2. **Corpus discovery and probing** — `swf-capability-index.ts::{buildSwfCapabilityIndex, inventoryImportConformanceCorpus}`;
   `import-conformance-core.ts::isImportConformanceFixtureReference`;
   `swf-capability-probe.ts::{probeSwfCapabilities, probeTagStream, uncompressSwf, ProbeReader, DIRECT_TAG_CAPABILITIES}`.
3. **Execution leaf** — `swf-import-conformance-worker.ts` registers Deflate and calls `createScene2DFromSwf`.
4. **Classifier policy**, two hooks — `import-conformance-classifier.ts::{SwfImportConformanceObservation, isCauseUnknownDiagnostic, isNoDecompressorDiagnostic}`.
5. **Reusable-looking core leaks SWF names and policy** —
   `import-conformance-core.ts::{ImportConformanceCapabilityIndex, buildImportConformanceCapabilityIndex, parseImportConformanceCapabilityDefinitions, createImportConformanceScore, classifyRetainedProbeEvidence}`;
   `import-conformance-score.ts::{IMPORT_CONFORMANCE_FIXTURE_OUTCOME_DEFINITIONS, ImportConformanceDenominators, parseDenominators, classifyRetainedFixtureOutcome}`;
   `import-conformance-format.ts::formatExercisedDenominator`; `check-import-conformance-ratchet.ts::formatExercisedDenominator`.
6. **Source hashing** fixes only the namespace salt — `import-conformance-runner-core.ts::hashImportConformanceImporterSource`; the source directory is already an argument, only `swf-importer-source-v1` is fixed.

**Under-specified, and easy to under-price.**

- **Retained diagnostic evidence** is shaped around current SWF diagnostics across three layers
  (`import-conformance-diagnostic-evidence.ts::retainDecidedDetail` fixes `characterId`/`frame`/`sceneCount`/deflate/lzma;
  `import-conformance-runner-core.ts::parseRetainedDiagnosticDetail`;
  `import-conformance-score.ts::{ImportConformanceFixtureDiagnosticDetail, parseFixtureDiagnosticDetail}`). A generic core needs a per-format evidence policy or a genuinely common detail schema.
- **Fixture-pack policy is more than a suffix** — `swf-capability-index.ts::inventoryImportConformanceCorpus` excludes `LICENSES` and `ROOT_METADATA_NAMES` and binds completeness to `verifiedFixtureFiles`. Pack-adapter behaviour, not core behaviour.
- ⚠ **The largest genuine core design seam: denominator validation hard-codes the present measurement
  method** — `import-conformance-score.ts::{ImportConformanceDenominators, parseDenominators, parseIndividuationMargin}`;
  `import-conformance-core.ts::{ImportConformanceScoreDeclarations, assertImporterDeclaredCensus, assertIndividuationMargin}`.
- **Test migration was absent from the original inventory.** Real edits concentrate in assertions for the fixed pack, prefix, `swfFormat`, no-decompressor ordering, and retained-detail policy. Most of the ~4,285 nominally generic test lines use SWF ids as *example data* and need no rewrite.

**Already an adapter — a core does not touch these, and counting them inflates the price.**

- `swf-capability-probe.ts` is 623 lines of real SWF logic and **already is the desired adapter**. A second format supplies another probe; nothing here is rewritten or parameterised.
- `swf-capability-index.ts` already calls the generic `buildImportConformanceCapabilityIndex` and passes declarations through `ImportConformanceScoreDeclarations`; its constants stay adapter-owned, and `deriveImportConformanceCapabilityScopedUnknownEvidence` is already format-neutral.
- `swf-import-conformance-worker-protocol.ts` and `swf-import-conformance-worker-pool.ts` are structurally generic transport/scheduling but for `Swf` names and a fixed worker URL. **Only** `swf-import-conformance-worker.ts` imports the SWF package.
- `import-conformance-classifier.ts` is mostly shared `ImportDiagnosticSeverity` ordering; its SWF surface is the observation type name and two diagnostic predicates.

**Limit on this inventory.** The *too-high* side was checked independently. The *omission* side was not:
the auditor had already read the estimate being checked before sweeping the code, so active enumeration
did not restore independence. **Degraded, not intact** — accepted deliberately, because the omission axis
could not change the decision in play and no uncontaminated reader was available. Treat the missed-coupling
list as a floor rather than as exhaustive.

## Status of the work this constrains

A format-agnostic core is **held, not rejected** — held one more beat behind a ~1 day experiment that
could redirect it: if downstream's failing input shows the defect is in the MD5 *importer* rather than in
our ability to *measure* MD5, the core buys nothing for that problem. Committing 3–5 days ahead of a
one-day experiment that could redirect them is the wrong order. See [swf status](status.md) for the current state of the SWF scoreboard,
and the `scene3d-formats` cell for MD5 itself.
