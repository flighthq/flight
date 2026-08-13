# Inert-gate audit

Audited at `6369398b6` against this doctrine: a verification tier either gates its claimed subject or
fails loudly; it must not silently degrade to success. The referenced `agents/capture-verification-tiers.md`
was not present in this clone or reachable history, so capture tier names below use the executable mapping
documented in `captureValidation.ts`: smoke is Tiers 1/2/4, parity is Tier 3, and committed-fingerprint
regression is Tier 5.

## 2026-08-13 follow-up: repository check processes

Audited at `e6f845bbb`. This pass derived the population from process-level verdicts, not from the
`*:check` suffix: a gate is a process whose exit status is consumed by `scripts/check.ts`, a hook, CI,
or a documented checkpoint. An alias is not another gate, and a report/generator is not a gate unless a
caller treats its exit as a verdict. That makes the bare `npm run check` runner's 24 unique leaf stages
the primary population. The seed list contributes 17 of those leaves; `build:check` and `capture:check`
are composites, while the two capture leaves and `reachability:runtime:check` are independent processes
outside the bare runner. The findings below are ranked; this is not a suffix inventory.

For every finding the question was: _what exact bad state must make this process fail, and has it ever
failed on that state?_ Cheap mutations were restored immediately. No frequency or repository-wide defect
rate is inferred from this deliberately adversarial sample.

| Rank | Gate | State that must be red | Has this gate failed on that state? | Finding |
| ---: | --- | --- | --- | --- |
| 1 | `capture:{examples,functional}:check` | Every selected target has a screenshot hash, and any mismatch is red | **No for missing evidence.** A missing `sha256` becomes `baselineHash=null`, `changed=null`; the final predicate only consumes render failures and `changed > 0`. Existing hashes can and do reject mismatches. | **P1 — strict capture evidence is partial.** Current discovery finds 7 target columns without screenshot hashes. Validation separately fails a wholly zero-comparison regression run, but becomes green after one comparison; 79 current target columns lack fingerprints. These include the WebGPU columns for `effect-blend-advanced`, `material-blend-modes`, `node-blend-modes`, and `node-blend-modes-fixed`. Other covered columns let the processes return green. **RECOMMENDATION:** require coverage for every selected target, with named exceptions rather than `null` evidence. |
| 2 | `reachability:check` | Removing an exported registrar from the claimed inverse/ownership population is red | **No outside three effects backends.** Renaming `registerWgpuUnlitMaterial` to `installWgpuUnlitMaterial` reduced the reported inventory from 301 to 300, yet the command exited 0 with `Built-in runners and per-kind registrars are exact inverses` and an unchanged lane baseline. | **P1 — the headline is broader than the hard population.** Only `effects-canvas`, `effects-gl`, and `effects-wgpu` feed `violations`; the repository-wide registrar census, `UNCATALOGUED` rows, and lane drift are non-blocking inventory. The command guide describes that distinction, but the command name and green headline do not. **RECOMMENDATION:** qualify the verdict as effects-only, or promote the intended repository-wide ownership/inverse conditions into the failure predicate. |
| 3 | `portable:check` | A shipped use of a runtime-dynamic mechanism outside the claimed C++-lowerable subset is classified or red | **No for `Object.defineProperty`.** The token screen and `violationOf` cover seven named mechanisms only; neither recognizes it. The surviving `render-gl` and `render-wgpu` uses are runtime-tier accessors, precedented as lowerable by opacity, so they are not proof of a violation; they prove the construct never reaches classification. The seven implemented rules are live. | **P2 — the verdict claims a semantic subset while enforcing a syntax list.** **RECOMMENDATION:** either classify and calibrate `defineProperty` or narrow the success line and contract to the seven enumerated escapes. |
| 4 | Direct selector-aware leaf checks | A selector matching no files is configuration failure, not proof that the named subject is clean | **No in five direct leaves.** `exports:check`, `order:check`, `portable:check`, `reachability:check`, and `type-home:check` each exited 0 for `__inert_gate_no_match__`; exports explicitly reported `0 files`. | **P2 — the shared zero-selection guard stops at the aggregate runner.** `npm run check -- __inert_gate_no_match__` exits 1 by name, as do the corresponding `test` and `size` controls. The normal scoped checkpoint `npm run check <selector>` is therefore protected; the exposed path is specifically a direct leaf invocation with a selector. **RECOMMENDATION:** make selector resolution return a required nonempty selection to every selector-aware leaf. |
| 5 | `tool-capture` CLI gate invocations | An unknown option, especially a misspelled strictness option, is usage error | **No.** `flag`/`hasFlag` recognize options opportunistically, but no command validates the remaining `argv`; an option such as `--fail-on-chagned` is ignored and leaves `failOnChanged=false`. | **P2 — a typo can turn an intended gate into an ordinary capture.** The fixed root npm scripts spell their flags correctly, so this does not invalidate those exact aliases; it invalidates ad hoc/documented CLI gating as fail-closed. **RECOMMENDATION:** declare allowed value/boolean options per command and reject unknowns before starting a server or browser. |
| 6 | `check:append-only-ledgers` | A working-tree edit to a guarded historical line is red | **Only when a baseline revision resolves.** With a baseline, editing a `Decisions` line failed by cell, section, and original text. When every candidate contains `HEAD` (or no candidate resolves), the process prints that it verified nothing and returns 0; its tests pin this outcome. | **P2 — loud skip still satisfies an exit-status gate.** On a fully integrated checkout, an uncommitted ledger edit is never read even though the implementation says the working tree is the subject. CI's fetched branch comparison normally supplies a baseline for work in flight; local/pre-commit use can be false-green. **RECOMMENDATION:** when guarded working-tree files differ from `HEAD`, use `HEAD` as the baseline; otherwise distinguish “not applicable” from a successful verification in callers. |

Finding 2 is now closed by the separate committed identity set in
`scripts/reachability-registrars.json`. `reachability:check` diffs exact `(package, registrar)` pairs and
names every addition and loss; `reachability:registrars:baseline` is the explicit whole-repository-only
acceptance path. The decisive replay renamed one registrar to a replacement, keeping the census at 301:
the gate exited 1 and named both `registerWgpuUnlitMaterial` as `LOST` and its replacement as `ADDED`.

### Confirmed live negatives

The findings above do not make every nearby gate suspect. The older mutation table below remains the
evidence for its eleven original stages. This follow-up independently broke and restored six newer
subjects: `backend-prefix:check` rejected the wrong exported registrar prefix and named its actual bad
segment; `catalog:check`, `facets:check`, `capabilities:check`, `capabilities:sites:check`, and
`instrumentation:check` each rejected a deliberately stale generated artifact by path. Their restored
forms all passed. The append-only check rejected an edited ledger line when a baseline was present.

The aggregate runner also fails closed on an empty selector and continues through independent leaves
before returning its aggregate verdict. The `test` and `size` selector controls likewise rejected an
empty selection. These are real negative controls, not inferences from a clean run.

### Borderline, explicitly undecided

- `catalog:check` currently verifies a declared empty Stage 4 catalog. It is mutation-proved live against
  stale output and says `0 entries`; whether the catalog must already be populated is a product decision,
  not an inert-gate verdict.
- `reachability:runtime:check` is not currently false-green: a clean run exits red with 52 unprobed
  assemblies, 8 probed-empty assemblies, and 8 collision keys. It is also absent from the aggregate and
  CI. The process computes `stateAdapter.canFail` and `orderedComparator.canFail` negative controls but
  does not consume them in its failure predicate; the existing baseline failures mask that gap. Treat it
  as a report-shaped `:check` whose intended blocking contract is undecided, not as evidence of safety.

## 2026-08-13 follow-up: which check processes CI actually invokes

that doc audits whether a gate CAN fail; this audits whether it RUNS.

"That doc" is everything above this section. The distinction matters because the two failures are
independent and neither implies the other: a gate can be mutation-proved live and never execute, and a
gate can execute on every push while being unable to fail. The `5eba48616` follow-up above found two
instances of the first by hand; this pass asks it of the whole population rather than of whichever
gates someone thought to check. Audited at `18930fda1` against all four `.github/workflows/*.yml`,
over the 162 scripts in the root `package.json`.

**Result: 40 of 162 are reachable from CI; 122 are not.** Of the 40, 18 are named directly in a
workflow and 24 are leaves of bare `npm run check` (two are reached both ways).

### Method: a name grep of the workflows is wrong in both directions

Neither direction is safe alone, which is why the number above is not a grep count.

- **False negatives.** The workflows name only 18 scripts, but `npm run check` (tests.yml, `quality`)
  fans out to 24 leaf gates that appear in no `.yml` at all. Grepping `packages:check` across the
  workflow files returns zero hits, and it runs on every push. Resolving this needs the closure:
  `npm run X` inside script bodies transitively, the `scripts/check.ts` gate table matched back by
  underlying script FILE plus check-flag rather than by label, and the matrix values behind
  `npm run ${{ matrix.check }}`. Two gates (`lint`, `format:check`) are registered through a ternary
  rather than an array literal, so even a parse of that table misses them.
- **False positives.** A first pass scored `test:regression` and `electron:gallery` as invoked. Both
  hits were in workflow COMMENTS — and one of them is the comment explaining why regression is
  EXCLUDED. Scoring a documented exclusion as coverage is the worse error of the two, because it
  reports the gap as closed.

Cross-check: 24 leaves in bare mode is the same count the `e6f845bbb` pass above derived
independently ("the bare `npm run check` runner's 24 unique leaf stages").

### Findings: gate-shaped, exits nonzero on a real bad state, nothing in CI runs it

| Gate | Subject | Disposition |
| --- | --- | --- |
| `evidence:check` | capture coverage manifest census | **Wired** into bare `npm run check` |
| `capture:{examples,functional}:check` | committed screenshot hashes | **Wired** onto the render-test matrix, pinned backends only |
| `reachability:runtime:check` | registrar runtime probe | Left alone; blocking contract undecided above |
| `test:size` | the `tools/size` vitest suite | **Not a finding after all, and the script no longer exists — see below** |

`evidence:check` is the sharpest case, because its own header states the intent it was denied: it
needs no browser, and "that is what makes it cheap enough to gate on rather than to run only at
acceptance time." Built to be gated on; not gated on. It is now mutation-proved live in the direction
that matters — pinning an oracle on `effect-bloom/canvas` that the scene does not export made it exit
1 naming `effect-bloom/canvas#oracle (pinned, no longer carried)`, which is exactly the pin-stopped-
being-true case the header says it exists to catch. It is green on the current tree, so wiring it
does not import a standing red.

Its placement is load-bearing and should not be "simplified" later. The coverage manifest is a
COMMITTED file, so a commit that deletes a pin from it touches no code and routes down the docs lane
under the `code`/`docs` filter split. Put in `quality`, the gate against silently retiring coverage
would itself be silently skippable through the exact door the manifest exists to close — the same
anti-correlation between a gate's coverage and its subject that the `docs:check` finding above
records. Bare `check` runs on every code path.

`test:size` earns its own line for the general shape, not the specific gap: **something that belongs
to no lane is invisible to any single-lane audit.** It is missed by the check/size route (it is not a
`check.ts` gate and is distinct from the invoked `size`, which is `scripts/size.ts`) and by the test
route (its header records that it is no longer a project of the master `vitest.config.ts`, so
`npm run test` does not collect it). A check of either route alone reports it covered by the other.

**Correction: that reachability fact is true, and the conclusion drawn from it was wrong.** Listing it
beside the other three implied its SUBJECT was unguarded. It is not. `tools/size/size.test.ts` and the
already-invoked `npm run size` both import `collectSizeCases` / `didSizeChecksPass` from
`scripts/size-runner` and both read the same `tools/size/size.baseline.json`, so the size budget is
gated on every push. `test:size` is a second front-end over one runner and one baseline — not an
orphaned gate.

Two things follow, and the second is the reason this correction is recorded rather than deleted.

- **The fence was deliberate and still holds.** `aeb609c0d` merged the master config to a single
  jsdom project including `packages/**/src/**`, and the SAME commit pointed `test-size.ts` at its own
  config and wrote the explanatory comment. `tools/size/vitest.config.ts` needs `environment: 'node'`
  and a 300s timeout for real builds; it cannot join a suite tuned for per-file environment reuse.
  Restoring it to the master config would be wrong.
- **Underneath the wrong conclusion there was a real, smaller finding.** Four assertions in that suite
  needed no build at all — two on the size-case declarations, one on the key format, one on the debug
  stub's transform — and were reachable only through a five-minute lane nothing ran. They now live in
  `scripts/size-runner.test.ts` and `scripts/size-debug-stub.test.ts`, which the ordinary suite
  collects. Three of them also carried `if (…) return` guards that made them pass vacuously whenever a
  filter narrowed the case set; the guards are gone, so they can now fail. The fifth assertion reads
  the built `results` and correctly stayed behind.

**Superseded 2026-08-13 by `afeeacea9`.** That commit reworked the size lane and deleted `test:size`,
`tools/size/size.test.ts`, and `tools/size/vitest.config.ts` outright, replacing them with
`scripts/size-fast-runner.ts` and `size:minified`. The reachability observation and the correction under
it are kept as the record of a reasoning error worth not repeating, not as live findings — the subject is
gone. One thing did NOT survive the two changes meeting: the single build-dependent assertion left behind
in `tools/size/size.test.ts` was the only test of `getFlightDiagnosticsSizeDelta`, which is still exported
and still used by `size-minified.ts`. Deleting the file took that coverage with it, invisibly to both
changes — the deletion had no reason to know the file held unique coverage, and the move had left exactly
one assertion there. It is restored in `scripts/size-runner.test.ts`, where it needs no build at all.

The generalisable part is not the size suite. **A reachability finding says a process does not run; it
does not say the subject is uncovered.** Those are different claims, and the second needs its own
check — here, one grep for who else imports the runner.

### Reachable is not the same as effective

Every gate on the INVOKED list is only known to RUN. The tables above this section are the evidence
on whether each can fail, and they find live P1/P2 defects in several of them. The two audits compose;
neither substitutes for the other.

### And a third question, found while wiring: does anyone RECEIVE the red?

Auditing invocation turned one up that neither question above asks. `nightly.yml`'s two jobs —
`test:coverage` and `api` generation — both run, and both can fail, and until `75da6b20b` **nothing
routed their failure anywhere**: no `if: failure()`, no issue, no notification, in any of the four
workflow files. A scheduled run has no author watching it, so a red landed in a log nobody opens.

That is the same defect one step further along the chain. A gate that cannot fail, a gate that never
runs, and a gate whose red reaches no one are three distinct ways to hold a verification that verifies
nothing, and passing either of the first two checks says nothing about the third. The fix routes each
failing job to one deduplicated issue, keyed on a stable title so a persistent failure accumulates
comments on one issue rather than filing a new one nightly — an unread inbox being the next way the
same defect comes back.

### Not invoked, with a reason (12)

Reportable but not defects — separating these from the four above is the point of reporting both
columns rather than a flat list.

- `test:regression` and its two leaves: excluded BY NAME in `tests.yml`, environment-coupled baselines.
- `build:check`: the preflight was removed deliberately; `check` runs `packages:check` and `typecheck`
  as its first two gates.
- `test:browser`, `test:smoke`, `test:parity`: aggregates whose leaves the render matrix runs directly.
- The corpus family — `conformance`, `conformance:fixtures`, `check:import-conformance`,
  `import:conformance:index`, `oracle:woff2-reversal` — needs an externally-acquired corpus, and
  `npm run fixtures` appears in no workflow. **This is a gap that had not been filled, not a structural
  impossibility.** An earlier draft of this section called it CI-absent "by construction" and that was
  wrong: the licence policy forbids VENDORING, while expressly permitting testing against licensed
  material by fetching on demand, keeping it outside the repo, and committing nothing. A workflow step
  that fetches into a gitignored cache is the sanctioned pattern, not an exception to it. The two
  phrasings invite opposite actions from a future reader, which is why the correction is recorded here
  rather than quietly amended.

One nuance that is pre-loaded to be misread by anyone skimming for "is conformance covered": the 24
files under `conformance/**/*.test.ts` DO run in CI, in the `conformance` vitest project of
`npm run test`. They are not the gate. Every one of these CLIs sits behind an
`import.meta.url === process.argv[1]` main-guard, so importing the module in a test runs no corpus and
produces no verdict. **Green conformance unit tests say nothing about corpus conformance.**

### Not gates (104), by exclusion reason

The population is what makes the four findings meaningful, so it is counted rather than listed.

| Count | Category | Why not a gate |
| ---: | --- | --- |
| 15 | Baseline / acceptance updaters | Rewrite the thing a gate compares against; manual by design |
| 12 | Generators | Their `:check` counterpart is invoked and compares the committed output |
| 4 | Fixers (`fix`, `lint:fix`, `order:fix`, `format`) | Mutate the tree; the non-fixing form gates |
| 24 | Reports, queries, `:json` variants, diagnostic instruments | Return data, not a verdict; `unchecked`/`untested` are documented as non-gating |
| ~46 | Dev servers, harnesses, cleanup, local tooling | No verdict and no CI role |
| 3 | Git hooks (`precommit`, `prepush`, `prepare`) | Local, not CI; both `precommit` gates are independently reached by bare `check`, so nothing is hook-exclusive |

### Caveat

This is static reachability read from the workflow files; no workflow was executed. It establishes
which processes CI starts, not what they do when they get there.

## Re-measured at `092a14194` — the examples findings in the `2026-08-12` severity-ranked table are CLOSED

Scope: this closes the EXAMPLES-side rows of the severity-ranked table dated `2026-08-12` (ranks 2 and 4),
and nothing else. It does not speak for findings added to this document later or above — name the table
and the date when re-scoping, never a position like "below", which silently re-points when someone
inserts a section.

Every examples-side finding in that table has since been fixed. The findings were real when
recorded; the tree moved. Re-measured numbers, derived by running the tool's own accounting rather
than by counting inputs:

| Claim as recorded | Re-measured |
| --- | --- |
| examples fingerprints cover `0/108` current targets | `108/132` targets HAVE a fingerprint |
| all 108 current targets lack a matching fingerprint | the same 108 is the count that has one |
| 41 fingerprint columns belong to 14 retired entry names | **0 orphans**; 41 entries ↔ 41 baseline files, 1:1 |
| examples screenshot hashes cover `117/132` | `131/132` |
| examples parity forms ZERO comparisons | **65 parity passed**, 0 failed, 1 uncovered — the tier is live |

Targets are derived as entry × its own renderer set (an example contributes only the renderers for
which `src/render.<renderer>.ts` exists), which is how `discoverEntries` enumerates them.

**Scoping that still holds, and that this document should have said explicitly:** the batch
(`tool-capture.batch.json`, which `test:examples` and `test:functional` drive) passes
`--no-regression` for BOTH subjects. Committed fingerprints are therefore consumed only by the
separately-invoked `test:*:regression` legs, which `AGENTS.md` scopes to the environment where the
baselines were captured. That is narrow-by-design, not inert — but a gate that is narrower in
practice than it reads is its own hazard, so state the scope wherever the examples gate is described.

**No coverage floor is enforced above zero.** Deleting one renderer column kept a run green (exit 0)
while deleting every column correctly failed. This held in the regression tier (79/441 functional,
24/132 examples targets uncompared) and again in the parity tier (43/324 parity units form no
comparison, run exits green).

**REGRESSION TIER: CLOSED** by the capture baseline coverage manifest
(`scripts/capture-baseline-coverage-manifest.json`, mechanism in
`packages/tool-capture/src/captureBaselineCoverageManifest.ts`). The tier now pins the exact SET of
`entry/renderer` identities that have comparable baseline evidence — 362 functional, 107 examples —
and names every gain and loss individually; both directions hard-fail, and acceptance is a separate
`--update-coverage` path that refuses an entry-filtered run. Falsified on both subjects against the
pre-fix commit: with a target's fingerprint deleted, pre-fix reports `✓ ok` exit 0 while other
comparisons still pass, post-fix exits 1 naming the identity. The case that justifies identities over
a count was constructed directly — a same-count swap (two functional targets lose their fingerprints,
two different ones gain real ones, total unchanged at 21 for the `node-` filter) is reported clean by
every count-shaped check and is named in all four parts by the manifest.

**HOW TO READ A FAILING REGRESSION TARGET — the freshness oracle hashes SCENE SOURCE ONLY, never SDK
source.** `getCaptureSceneSourceHash` sha256s the scene file and nothing else, so the `changed` /
`unchanged` classification answers *did the author touch this scene*, never *did rendering change*. That
is correct scoping for an authorship oracle, but it fixes how the output must be read: **a pure rendering
regression can never appear as `changed`.** It can only ever appear as a target with ZERO source change
and a bad distance. So `unchanged` is not the reassuring branch — it is the one that has no authorship
explanation, and every clean-but-failing target is a candidate rendering regression. Such targets must
never be batch-recaptured; recapture would bless the regression as the new reference and destroy the
evidence.

**CONFIRMED, DO NOT RECAPTURE: `material-wireframe/webgl`.** Zero scene-source change since its baseline
(recorded hash matches the current file exactly), yet a regression distance of 18.04 against a tolerance
of 5. The baseline is the honest party here; the output is the suspect. It is the only one of the 52
failing functional targets that owes neither of the two candidate causes.

**A CONFIRMED-CORRECT CAUSE CLEARS ONLY A TARGET THAT OWES NOTHING ELSE.** Of the 52 failing targets, 30
owe both candidate causes, 21 owe `e2b99fc68` alone, **0 owe `b467652e8` alone** — its set is a strict
subset. Shares of a failing set overlap and are not disjoint groups, so "this commit accounts for 58% of
failures" never licenses "confirming it clears 58% of targets."

**PARITY TIER: STILL OPEN.** The 43/324 parity units that form no comparison are not covered by this
mechanism; the manifest pins regression evidence only. A parity-side equivalent is unbuilt.

## Severity-ranked findings

The eleven `scripts/check.ts` stages are live. Every one was mutation-proved red, and a compound mutation
proved the runner continues through later stages before returning an aggregate failure.

The release graph and capture matrix have six material trust gaps, ranked by the amount of trust they can
silently absorb:

| Rank | Gate | Claimed or implied trust | Evidence: actual failure behavior | Severity-ranked finding | Recommendation |
| ---: | --- | --- | --- | --- | --- |
| 1 | Nightly `promote` | `main` advances only to a known-good commit | It needs only `resolve`, `coverage`, and API-printing jobs. It neither waits for nor queries the exact SHA's `tests.yml` result, so it can promote after build, isolated-test, quality, size, or render failure. The push triggers CI on `main` only after promotion. | **P0 — known-good predicate is incomplete** | **RECOMMENDATION:** Require the exact pinned SHA's complete per-commit gate conclusion before promotion. |
| 2 | Examples Tier 3 / `Render · examples · parity` | Current Canvas/WebGL/WebGPU output agrees | All 108 current validation targets lack a matching fingerprint baseline. Legacy parity admits only baselined targets, so it forms zero pairs. A clean scoped run exited 0 with `0 parity passed`, `6 skipped`; all 41 entries have zero eligible pairs. The 41 example fingerprint columns that do exist belong to 14 retired entry names. | **P0 — parity tier forms zero comparisons** — CLOSED, see the re-measurement above: 65 parity pairs now form | **RECOMMENDATION:** Use explicit same-run parity groups or fail when required fingerprints/pairs are absent. |
| 3 | Examples Tier 4 / `Render · examples · smoke` | Every example renders non-blank | Direct examples smoke defaults `verify=false`. Replacing `bitmap` Canvas rendering with a no-op produced changed screenshots, `0 failed`, and exit 0. The examples parity leg did reject the same blank build as a verifier load failure, so aggregate CI has a second-line catch, but the smoke/not-blank gate itself is false-green. | **P1 — smoke does not prove non-blank output** | **RECOMMENDATION:** Enable verifier/readback and require every selected example target to publish a non-blank result. |
| 4 | Tier 5 regression / `test:*:regression` and `capture:*:check` | Current output matches committed baselines | Missing baselines become skips or `changed=null`, and no minimum coverage is enforced. Fingerprints cover examples `0/108` current targets and functional `310/416`; screenshot hashes cover examples `117/132` and functional `401/416`. An all-missing suite succeeds. | **P1 — CLOSED for the regression tier, OPEN for parity** — the EXAMPLES numbers are CLOSED (see above); the coverage floor above zero is now gated for regression by the capture baseline coverage manifest, and remains ungated for parity | **LANDED:** an exact-set manifest of `entry/renderer` identities with a named +/- diff and a separate `--update-coverage` acceptance path. Parity has no equivalent yet. |
| 5 | Nightly `api` | API quality/generation contributes to promotion | `npm run api` and `npm run api:json` only print parsed output; neither invokes rules nor persists/diffs an artifact. An `isEven(...): number` mutation made both commands exit 0 while `api:check` exited 1 for an accessor violation. | **P1 — parser smoke does not enforce API policy** | **RECOMMENDATION:** Add `api:check`, or narrow the job's documented trust claim to parser smoke. |
| 6 | `edge-publish` dependencies | Published snapshots passed CI | By explicit policy it needs only `build` and `test-fast`. A snapshot can publish despite failures in isolated/tool-capture tests, quality, size, harness builds, or any render leg. This is documented reduced fidelity, not accidental control flow, but the artifact must not be described as fully CI-gated. | **P1 — snapshot evidence intentionally omits six families** | **RECOMMENDATION:** Either add the omitted dependencies or label snapshots as build-plus-fast-test gated. |

**ONE DEFECT, FOUR MANIFESTATIONS: the pipeline records which evidence EXISTS and never records which
evidence SHOULD exist.** Wherever evidence is optional, its absence is indistinguishable from
satisfaction. This is not three gates each missing a check — it is one missing concept, surfacing once
per evidence kind over the SAME target set. It will surface again in any tier added until something
declares what ought to be there.

| # | Tier | Two-arm proof | Result |
| --- | --- | --- | --- |
| 1 | Fingerprint regression | one target's fingerprint deleted while others still compare | run stays **green**: the zero-floor is satisfied by any single comparison |
| 2 | Screenshot hash (`capture:check`) | `node-alpha/canvas` sha256 **wrong** vs **absent** | wrong → `±`, **exit 1**. absent → `✓`, **exit 0**. Deleting a baseline is safer than breaking one. |
| 3 | Tier-4 oracle (`functionalVerify.ts`) | `node-alpha` fill broken, oracle intact vs export misspelled | intact → **exit 1** named on canvas/webgl/webgpu. misspelled → **exit 0**. |
| 4 | Oracle outcome not recorded anywhere | tried to confirm one target's oracle result from its own artifacts | `status.json` and `logs.jsonl` carry **no** oracle record; the outcome is only inferable from control flow (a failure writes `state: 'error'`). Observed, not mutated. |

Manifestation 2 was found independently and landed as rank 1 of the `2026-08-13` table above; this row is
corroboration by a second method, not a separate finding.

**The census itself was inert by NON-INVOCATION until 2026-08-13, which is the same defect one level up.**
`evidence:check` was written to gate, falsified in both directions, and then wired to nothing: not
`scripts/check.ts`, not any workflow. A deliberate opt-out and an oversight look identical from outside,
so the category had to be established before the remedy — a check CI genuinely cannot run belongs in
[boundary-only checks](boundary-only-checks.md), and only a check CI *can* run is fixable by wiring.
Established by control rather than by reading its header: the census reads committed baselines and scene
sources off disk, and it exits 0 with `.artifacts` and the functional dist both absent. So it can run in
CI, and it is now a stage of the whole-repo `npm run check`, which the `quality` job runs under a **code**
change trigger — the right one, since an oracle export vanishing is a code change and not a docs change.
Falsified after wiring: dropping one pin from the manifest makes the whole sweep exit 1 naming
`material-subsurface/webgl#oracle`, not merely the standalone script.

**Manifestation 4 is closed, and its first fix had a hole worth keeping on the record.** The verifier now
records `oracle: 'invoked' | 'absent'` from the branch that calls, and `captureEntry` carries it into
`status.json`. But the error-path status wrote a hardcoded `null`, with the `verification` binding scoped
inside the `try` — so the record was dropped on exactly the path that motivated the field. An oracle that
runs and rejects a frame both ran and failed, and the artifact said it never ran while carrying an error
message only that oracle body could produce. A reader who trusts the field then counts a live oracle as a
dead one. Fixed by hoisting the binding; pinned by `captureEntry.e2e.test.ts`, whose two arms separate
"oracle threw" from "failed before the assert step". **Measured after the fix, over a full functional
capture of all 493 targets: 374 invoked, 119 absent, 0 unrecorded — every oracle the census pins actually
runs.** The general shape: a field that reports whether a step happened must survive the failure of that
step, or it only ever describes the successful case.

**Current exposure, measured per TARGET (entry × declared renderer), which is what the gates select:**
functional 493 targets — 88 carry no fingerprint, 43 no screenshot hash, 119 no oracle; examples 132
targets — 1 carries no screenshot hash, and **none** carry an oracle, because the examples harness has no
`assertRender` equivalent at all. Counting baseline *columns* instead gives smaller numbers (33 rather
than 43 for screenshots) because a target with no baseline file has no column to count — the column view
structurally cannot see the targets that are missing entirely.

**The exposed set is GROWING.** Of the 14 functional scenes with no screenshot hash, 10 first appeared in
the two days before this entry: nothing requires a new scene to arrive with a baseline, so every scene
that lands widens the gap silently.

**Ten of those fourteen scenes are this session's own work** — `node-transform-mirror`,
`swf-mirrored-placement`, `mesh-tangent-mirror-handedness`, `text-markup-color`, and all six `svg-*`
scenes. `node-transform-mirror` has been ungated on all three of its backends from the moment it landed:
it was written this session to close the mirroring blind spot, and it was itself partly inert. A
deliverable of this session could not fail its own gate. That is the strongest argument that exists for
why this sweep was worth running, and it is recorded here rather than left for review to find.

**FIX (landed):** the capture baseline coverage manifest carries all three evidence kinds as columns on
one row per target, rather than three parallel manifests — a target's evidence profile is one fact, and
three files would be three places for it to drift. A loss is named `target#kind`. The acceptance path and
the scoped-run guard are inherited unchanged. One rule makes the consolidation safe: a run declares which
kinds it OBSERVED, and unobserved kinds are never reported lost — otherwise a validate run, which sees
only fingerprints, would report every screenshot and oracle pin as missing.

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
