# Inert-gate audit

Audited at `6369398b6` against this doctrine: a verification tier either gates its claimed subject or
fails loudly; it must not silently degrade to success. The referenced `agents/capture-verification-tiers.md`
was not present in this clone or reachable history, so capture tier names below use the executable mapping
documented in `captureValidation.ts`: smoke is Tiers 1/2/4, parity is Tier 3, and committed-fingerprint
regression is Tier 5.

## Severity-ranked findings

The eleven `scripts/check.ts` stages are live. Every one was mutation-proved red, and a compound mutation
proved the runner continues through later stages before returning an aggregate failure.

The release graph and capture matrix have six material trust gaps, ranked by the amount of trust they can
silently absorb:

| Rank | Gate | Claimed or implied trust | Evidence: actual failure behavior | Severity-ranked finding | Recommendation |
| ---: | --- | --- | --- | --- | --- |
| 1 | Nightly `promote` | `main` advances only to a known-good commit | It needs only `resolve`, `coverage`, and API-printing jobs. It neither waits for nor queries the exact SHA's `tests.yml` result, so it can promote after build, isolated-test, quality, size, or render failure. The push triggers CI on `main` only after promotion. | **P0 — known-good predicate is incomplete** | **RECOMMENDATION:** Require the exact pinned SHA's complete per-commit gate conclusion before promotion. |
| 2 | Examples Tier 3 / `Render · examples · parity` | Current Canvas/WebGL/WebGPU output agrees | All 108 current validation targets lack a matching fingerprint baseline. Legacy parity admits only baselined targets, so it forms zero pairs. A clean scoped run exited 0 with `0 parity passed`, `6 skipped`; all 41 entries have zero eligible pairs. The 41 example fingerprint columns that do exist belong to 14 retired entry names. | **P0 — parity tier forms zero comparisons** | **RECOMMENDATION:** Use explicit same-run parity groups or fail when required fingerprints/pairs are absent. |
| 3 | Examples Tier 4 / `Render · examples · smoke` | Every example renders non-blank | Direct examples smoke defaults `verify=false`. Replacing `bitmap` Canvas rendering with a no-op produced changed screenshots, `0 failed`, and exit 0. The examples parity leg did reject the same blank build as a verifier load failure, so aggregate CI has a second-line catch, but the smoke/not-blank gate itself is false-green. | **P1 — smoke does not prove non-blank output** | **RECOMMENDATION:** Enable verifier/readback and require every selected example target to publish a non-blank result. |
| 4 | Tier 5 regression / `test:*:regression` and `capture:*:check` | Current output matches committed baselines | Missing baselines become skips or `changed=null`, and no minimum coverage is enforced. Fingerprints cover examples `0/108` current targets and functional `310/416`; screenshot hashes cover examples `117/132` and functional `401/416`. An all-missing suite succeeds. | **P1 — regression evidence is partial and can be empty** | **RECOMMENDATION:** Gate an explicit baseline-coverage manifest; allow missing targets only through named exceptions. |
| 5 | Nightly `api` | API quality/generation contributes to promotion | `npm run api` and `npm run api:json` only print parsed output; neither invokes rules nor persists/diffs an artifact. An `isEven(...): number` mutation made both commands exit 0 while `api:check` exited 1 for an accessor violation. | **P1 — parser smoke does not enforce API policy** | **RECOMMENDATION:** Add `api:check`, or narrow the job's documented trust claim to parser smoke. |
| 6 | `edge-publish` dependencies | Published snapshots passed CI | By explicit policy it needs only `build` and `test-fast`. A snapshot can publish despite failures in isolated/tool-capture tests, quality, size, harness builds, or any render leg. This is documented reduced fidelity, not accidental control flow, but the artifact must not be described as fully CI-gated. | **P1 — snapshot evidence intentionally omits six families** | **RECOMMENDATION:** Either add the omitted dependencies or label snapshots as build-plus-fast-test gated. |

Two lower-ranked findings remain:

- **P2 FINDING:** Capture treats `BACKEND_UNAVAILABLE` as a successful skip and has no required-backend or minimum-target
  count. A whole GPU backend can disappear while the job remains green. The skip is visible in logs but does
  not gate. **RECOMMENDATION:** Require named backend exceptions and a minimum executed-target count.
- **P3 FINDING:** `tests.yml` runs `npm run size` twice in the same job. Both invocations are live, but the
  second adds cost, not independent evidence. **RECOMMENDATION:** Remove the duplicate invocation.

## `scripts/check.ts`

The bare runner is run-all/report-all. A compound `math` mutation (top-level side effect, type error,
`eval`, and top-level `vi.mock`) made `packages:check`, `typecheck`, `lint`, `portable:check`, and
`mocks:check` red while the other six stages still executed. Each remaining subject was then mutated
independently.

| Stage | Protected subject | Failure verified |
| --- | --- | --- |
| `packages:check` | Workspace topology, package metadata/layers, side-effect and SDK barrel policies | Top-level side-effect mutation failed the stage. |
| `typecheck` | SDK/examples/scripts, functional scenes, tools/root configs | Type mutation failed; the full helper still attempted all three TS projects. |
| `lint` | Oxlint rules with zero warnings | `eval` mutation failed. |
| `format:check` | Repository formatting | Bad spacing failed `oxfmt --check`. |
| `order:check` | Exported-function and test-block ordering | Moving a `describe` name out of order failed. |
| `exports:check` | Exported function test completeness | Adding an untested exported function failed. |
| `type-home:check` | Public type ownership in `@flighthq/types` | Adding an exported interface outside the type home failed. |
| `portable:check` | Portable-source allowlist | Non-portable `eval` failed. |
| `mocks:check` | Mock-tier census and policy | Unregistered top-level `vi.mock` failed. |
| `api:check` | Duplicate API names and accessor-prefix contracts | `isEven(...): number` failed. |
| `support:check` | Generated renderer support matrix matches its source census | Mutating the generated heading failed as stale output. |

Scoped `npm run check <selector>` intentionally omits the whole-repository package, API, and support stages;
the bare command includes them. That is a documented scope distinction, not an inert gate.

## Per-commit CI (`tests.yml`)

| Leg | Protected subject | Failure-verified/how or limitation |
| --- | --- | --- |
| `changes` | Run code legs for all changes except Markdown and `agents/**` | **Inert for two subjects — see the follow-up finding below.** The all-except filter is structural and its action failure is a job failure, but the exclusions are not purely a cost optimization: `docs:check` and the agent-tooling sources both live inside the excluded set. |
| `build-check` | Package policy plus all TypeScript project checks | Active: the package/type compound mutation failed. Every ordinary verification leg needs this job. |
| `build` | Root TS build and emitted packages | Active by `tsc -b`; compile failure is nonzero. It reruns after snapshot version stamping inside `edge-publish`. |
| `harness-build` · functional | Functional Vite harness bundles | Active build command; a clean build is required before success. |
| `harness-build` · examples | Examples Vite harness bundles | Active; clean `npm run build:examples` completed during this audit. |
| `test` | Per-package tests in their declared environments, including serialized tool-capture/browser contracts | Active: a deliberately false `math` assertion made the package-config command exit 1. This is the only unit-test leg that includes tool-capture and preserves package environments. |
| `test-fast` | Ordinary root unit tests in merged jsdom | Active: the same false assertion made the merged-config command exit 1. It deliberately excludes tool-capture; the isolated `test` leg covers that exclusion, but `edge-publish` does not wait for it. |
| `quality` | All eleven `scripts/check.ts` subjects | Active; every stage mutation-proved. |
| `size` | Gzipped example/fixture bundles stay below 105% of baseline | Active: lowering `bitmap:canvas` baseline to one byte made the filtered command exit 1. The identical command is unnecessarily run twice. |
| `render-test` · functional smoke | Functional build/load, page errors, verifier assertions, and non-blank readback | Active: functional capture defaults verification on; verifier/load failures increment `failed`. |
| `render-test` · functional parity | Same-run agreement against Canvas reference for available targets | Active explicit parity groups; unlike legacy parity, these do not need baselines. There is still no suite-level minimum comparison count. |
| `render-test` · examples smoke | Example build/load and page/console/network errors | Partially active, but non-blank verification is off. The no-op renderer mutation exited 0. |
| `render-test` · examples parity | Example verifier load plus cross-backend parity | Load/blank failures are active, but parity is inert: zero current eligible pairs because all matching fingerprints are missing. |
| `edge-publish` | Build and publish `edge`/`next` snapshot | Publication is active, but its dependency set is only `build` plus `test-fast`; six other verification families cannot block it. |

### Follow-up finding: a gate can be live and still never run on its subject

Audited at `5eba48616`, after the table above. The original audit asked, for each stage, _does it fail when
its subject is broken?_ — and answered yes for all eleven `scripts/check.ts` stages. It did not ask the
prior question: _does it run when its subject changes?_ Two gates fail that second question, and no amount
of mutation-proving the stage would have revealed it.

**P1 — `docs:check` is excluded from CI by its own subject.** The chain is `changes` → `code` = `**` minus
`**/*.md` minus `agents/**`; `build-check` runs `if code == 'true'`; `quality` needs `build-check` and is
the only path to `npm run check`, which contains `docs:check`. But `docs:check`'s entire subject _is_
`AGENTS.md` and the `agents/**` cells. A commit touching only those produces `code == 'false'` and runs
nothing, so the gate's coverage is anti-correlated with its subject: the docs-only changes most likely to
break docs are exactly the ones never checked. Measured over the 40 commits ending at `5eba48616`,
**12 (30%) trigger zero CI legs**, including `f839a2252`, which introduced an `AGENTS.md` line claiming the
texture model had "only M2 implemented" while the linked doc said M2–M5 had landed. **RECOMMENDATION:**
give `changes` a second `docs` output and a `docs` job that runs `docs:check` without depending on
`build-check`, so docs-only commits stay cheap but are still gated.

That victim also shows the two defects are independent and both required: even had `quality` run,
`docs:check` has no staleness rule, so it would have passed. Fixing the filter makes the gate fire; it does
not by itself make it catch this. Any new AGENTS.md content rule is born inert until the filter is fixed.

**P1 — `agents/**` holds executable tooling with no automated coverage of any kind.** The exclusion reads as
a docs exclusion, but the path also contains `todo.mjs`, `scaffold.mjs`, `bless-queue.mjs`, `todo-items.mjs`,
and `todo-target.mjs` — the tooling agents run to find work. These are excluded from the CI path filter
_and_ independently ignored by the linter (`.oxlintrc.json` ignores `agents/**`) _and_ outside the
`tsconfig.json` include list. Three independent exclusions, so fixing any one leaves them uncovered.
**RECOMMENDATION:** treat the executable subset as code — narrow the CI filter exclusion to `agents/**/*.md`
rather than `agents/**`, and take the linter exclusion down to match.

## Nightly CI (`nightly.yml`)

| Leg | Protected subject | Failure-verified/how or limitation |
| --- | --- | --- |
| `resolve` | Pin one `develop` SHA for all nightly work | Active: downstream checkout uses the emitted SHA. This establishes identity but says nothing about that SHA's per-commit CI conclusion. |
| `coverage` | Tests plus global V8 thresholds (85% statements, 75% branches, 90% functions, 85% lines) | Active Vitest/coverage exit status; test failures or threshold misses fail the job. It is not a substitute for the per-package environment, build, quality, size, or render legs. |
| `api` | API extractor can parse and print text/JSON | Active only as parser smoke. Both invocations accepted an API-policy mutation that `api:check` rejected, and their output is not persisted or diffed. |
| `promote` | Fast-forward `main` to the pinned SHA | Push/fast-forward failure is loud, but the known-good predicate is incomplete: `needs` contains only `resolve`, `coverage`, and `api`. |

## Capture tiers

| Tier | Subject | Failure-verified/how or inert/why |
| --- | --- | --- |
| 1: build/load/capture | Functional and examples | Active. Build, navigation, selector, screenshot, and non-skippable load failures return nonzero. |
| 2: error-free render | Functional and examples | Active for page errors and error logs under `--fail-on-error`. Backend-unavailable text is downgraded to success-with-skip, with no minimum backend coverage. |
| 3: cross-backend parity | Functional | Active same-run comparison using explicit Canvas-reference groups. It does not require a committed baseline. Entries with fewer than two available/allowed targets form no pair without failing. |
| 3: cross-backend parity | Examples | Inert. Legacy eligibility requires fingerprints; current coverage is `0/108`, hence zero pairs. Focused clean evidence: `0 parity passed`, `6 skipped`, exit 0. |
| 4: verifier/non-blank | Functional smoke | Active because functional capture defaults `verify=true`. |
| 4: verifier/non-blank | Examples smoke | Inert in the direct CI command because examples default `verify=false`. A blank no-op Canvas implementation was accepted. The separate parity process currently supplies a second-line blank check. |
| 5: coarse fingerprint regression | Functional | Partial: 310 of 416 current validation targets have fingerprints; the other 106 skip. Local/environment-coupled, not in per-commit CI. |
| 5: coarse fingerprint regression | Examples | Inert for current entries: 0 of 108 validation targets have fingerprints; all existing example fingerprints are orphaned under retired names. |
| Strict screenshot-hash check | Functional and examples | Partial: 401/416 and 117/132 current targets have SHA baselines. Missing hashes produce `changed=null`, so `--fail-on-changed` still succeeds for them. |

## Consolidated recommendations

1. **RECOMMENDATION:** Make promotion consume a conclusion for `tests.yml` at the exact pinned SHA, or repeat every required
   gate inside the promotion workflow. Do not infer yesterday's PR success from branch membership.
2. **RECOMMENDATION:** Give examples explicit same-run parity groups, as functional already has, or make missing required
   fingerprints and zero-pair suites fail nonzero. Delete/regenerate the 14 orphan baseline files.
3. **RECOMMENDATION:** Enable verifier/readback for the direct examples smoke command and require a verified/non-blank count
   equal to the selected target count.
4. **RECOMMENDATION:** Add baseline-coverage manifests/minima to fingerprint and SHA regression commands. Missing baselines may
   be an explicit allowlisted exception, never an uncounted success.
5. **RECOMMENDATION:** Run `api:check` in nightly (or remove the API job from the promotion-quality claim). Persist/diff a
   generated artifact only if API drift itself is intended to gate.
6. **RECOMMENDATION:** Decide whether snapshot policy intentionally permits every omitted failure. If yes, label snapshots
   “build + fast-test gated”; if no, add the missing jobs to `edge-publish.needs`.
7. **RECOMMENDATION:** Remove the duplicate size invocation and require an explicit minimum for renderer targets that may be
   skipped as backend-unavailable.
