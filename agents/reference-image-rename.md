# Reference-image rename — retiring "oracle" as an unqualified term

**Status: ratified by the user 2026-08-17. Ready to dispatch.** This is a work plan, not a proposal.

## Why

"Oracle" is a **genus** in the testing sense: a fingerprint comparison, a stored-image comparison, and an
exported `assertRender` are all test oracles. Using it as a species name meant one word denoted three
different things across the tree, and reading any one use required knowing which. That ambiguity cost the
project several days of fleet time before it was diagnosed.

The rule this establishes, and the one that keeps it from recurring:

> **Never use "oracle" unqualified. It is a category, not a thing. Every use names its species.**

## THE PARTITION — read this before touching anything

The word covers three distinct concepts. **Two rename to different targets and one must not be touched.**
A blanket find-and-replace corrupts the third and mis-renames the largest population. Measured, not
estimated:

| bucket | concept | population | becomes |
| --- | --- | --- | --- |
| **A** | the blessed reference-image pipeline | 25 `scripts/oracle-*` files, 4 workflows, 5 npm scripts, **59** exported identifiers | `reference-image` |
| **B** | the in-scene assertion (`assertRender`) | **333** scenes export it, 226 carry `// Oracle:` / `// ORACLE-BLOCK` comments, 1 enum member, **2** identifiers | `assertion` |
| **C** | genuinely unrelated oracles | **11** identifiers, ~23 conformance files, 1 npm script | **UNCHANGED** |

**B is 13× larger than A and renames to a different word.** Anyone who reads "rename oracle to
reference-images" and starts sweeping will hit the scene corpus first and rename 226 files to exactly the
wrong thing. This is the single largest risk in the task.

### Bucket C — the exclusion list, verbatim

These are **correct qualified uses of the genus**. Do not rename them; do not "finish the job" later.

Identifiers (11): `ImportConformanceCaseOracleEvidence`, `ImportConformanceCaseOracleOutcome`,
`ImportConformanceOracleAssurance`, `ImportConformanceOracleEvidence`, `ImportConformanceOracleOutcome`,
`ImportConformanceOracleOutcomePopulations`, `ImportConformanceOracleOutcomes`,
`TangentXCorrelationOracle`, `applyImportConformanceOracleOutcomes`,
`assertImportConformanceOracleOutcomes`, `parseImportConformanceOracleOutcomes`.

Files: `conformance/font/font-oracles.ts`, `conformance/font/woff2-reversal-oracle.ts` and their tests.
Script: `oracle:woff2-reversal` keeps its name.

### Bucket B — the two identifiers, so they are not swept into A

`CaptureVerificationOracle` and `FunctionalRenderOracle` are the *assertion* sense, not the pipeline.
They become `CaptureVerificationAssertion` and `FunctionalRenderAssertion`.

## Piece 1 — the enum and its migration

Self-contained, independently verifiable, and the piece that actually fixes the reported confusion. It is
the member claiming the genus while denoting one species.

`CaptureBaselineEvidenceKind` in `packages/tool-capture/src/captureBaselineCoverageManifest.ts:55`:

    'fingerprint' | 'oracle' | 'referenceImage' | 'screenshot'
      becomes
    'assertion' | 'fingerprint' | 'referenceImage' | 'screenshot'

`'referenceImage'` **does not change.** It is already the right word, it matches the repository name, and
it is the extensible one — if unblessed candidates are ever tracked, `referenceImage` stays the genus and
gains a sibling.

This is **persisted data, not just a type**: the union feeds `CaptureBaselineCoverageManifest` at
`schemaVersion: 2`. Bump the schema and rewrite every committed manifest carrying `"oracle"` in the same
commit. `ORACLE_EXPORT` (`scripts/capture-evidence.ts:31`) renames with it — it is the detector that
produces the value, and leaving it behind splits the concept across two names again.

## Piece 2 — bucket A, the pipeline rename

**Blocked on the host-side repository rename. Must not land before `flight-reference-images` exists**, or
the four workflows break on a repository that is not there.

### Give the domain a directory

25 loose files and 3 loose JSON files in `scripts/` become one unit. The path carries the domain, the file
carries the role, and nothing ends up named `reference-image-reference-image-*`:

    scripts/reference-images/
      lock.json  held.json  capture-identity.json
      calibrate.ts  candidate.ts  check.ts  commission.ts  commission-batch.ts
      compare.ts  eligibility.ts  pack.ts  png.ts  records.ts  state.ts  verify.ts
      (+ colocated .test.ts for each, per the testing convention)

### Types keep the prefix — with three exceptions

TS types are global and the house rule wants them self-identifying, so `ReferenceImageLock` earns its
length. Run this as a **naming pass with an exception list, not as sed**:

| now | becomes | why not mechanical |
| --- | --- | --- |
| `OracleLockImage` | `ReferenceImageDigest` | mechanical gives `ReferenceImageLockImage`; the type carries only `pixelSha256` |
| `oracleCommit` (field on `OracleLock`) | `sourceCommit` | it is the commit the release was cut from, not an "oracle commit" |
| `OracleLockImageProblem` | `ReferenceImageDigestProblem` | follows `ReferenceImageDigest` |

The other 56 take the straight `Oracle` → `ReferenceImage` prefix swap.

### npm scripts — action-first, per the settled rule

The rule: `X:check` is available only when `X` exists as a real command to modify; with no doer it is
`check:X`. None of these has a doer, so all take a verb head.

| now | becomes |
| --- | --- |
| `oracle:check` | `check:reference-images` |
| `oracle:fetch` | `fetch:reference-images` |
| `oracle:commission` | `commission:reference-images` |
| `oracle:commission:write` | `commission:reference-images:write` |
| `oracle:scope` | `scope:reference-images` |
| `oracle:woff2-reversal` | **unchanged** (bucket C) |

Accepted deliberately: this scatters the family across the alphabet, trading `oracle:<TAB>` grouping for
consistency with `check:*`. That trade was made knowingly.

### Workflows

`oracle-bridge.yml`, `oracle-calibrate.yml`, `oracle-capture.yml`, `oracle-check.yml` rename to
`reference-image-*.yml`. Every `flight-oracles` string inside them, including the GitHub App
`repositories:` scope, moves to `flight-reference-images`.

## Piece 3 — bucket B prose, and the rule on record

The 226 scene comments (`// Oracle:` → `// Assertion:`, `// ORACLE-BLOCK` → `// ASSERTION-BLOCK`). Verified
that **no tooling reads `ORACLE-BLOCK`** — zero hits across `scripts/`, `packages/`, `.github/`,
`conformance/` — so this is prose, safely mechanical within bucket B, and touches nothing executable.

Then record the rule at the top of this file in the convention docs, plus the bucket C exclusion list.
Without that, a later cleanup pass "completes" the rename and breaks the conformance oracles.

## Verification

- `npm run check` and `npm run test` on the final tree — this crosses package boundaries, so the bare
  whole-repo form is required, not a scoped one.
- `npm run packages:check` after the manifest and script changes.
- A coverage manifest round-trip proving the migrated `schemaVersion` reads back with `'assertion'` and no
  `'oracle'` remains in committed data.
- `grep -ri oracle` over the tree returns **only** bucket C. That is the completion test; state the
  surviving count rather than asserting none.

## What is NOT in scope

The still-open schema decision — whether captures are blessed in one canonical environment
(Docker/SwiftShader, which would make regression environment-independent and PR-gateable) or as
per-environment sets keyed by GPU/driver — is unresolved and remains with the user. It does not block any
piece here.
