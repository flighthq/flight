# Gate Audit Results

Fresh measurement of all 29 non-advisory whole-repo gates in `scripts/check.ts`.
Each gate was tested by applying a mutation, running the gate, recording exit code and
failure output, and restoring the file.

**Result: 29/29 FIRES.**

---

## Gate 1: packages:check

- **Verdict:** FIRES
- **Specimen:** Change `"sideEffects": false` to `"sideEffects": true` in `packages/math/package.json`
- **Exit code:** 1
- **Failure output:**
  ```
  @flighthq/math
    ✗ sideEffects is false — got true
  ✗ 1 error across 1 package
  ```

## Gate 2: license-provenance:check

- **Verdict:** FIRES
- **Specimen:** Append the comment formed by joining `// `, `Derived`, ` from https://example.com, `,
  `M`, and `IT license` to `packages/math/src/clamp.ts`
- **Exit code:** 1
- **Failure output:**
  ```
  2 violations
  ```

## Gate 3: package-dist-orphans:check

- **Verdict:** FIRES
- **Specimen:** Create `packages/orphanpkg/dist/orphan.js` (a dist/ directory under a package directory with no package.json)
- **Exit code:** 1
- **Failure output:**
  ```
  Orphaned package build output detected
  ```

## Gate 4: typecheck

- **Verdict:** FIRES
- **Specimen:** Append `const x: string = 42;` to `packages/math/src/clamp.ts`
- **Exit code:** 1
- **Failure output:**
  ```
  packages/math/src/clamp.ts(24,7): error TS2322: Type 'number' is not assignable to type 'string'.
  ```

## Gate 5: lint

- **Verdict:** FIRES
- **Specimen:** Append `eval('test')` to `packages/math/src/clamp.ts`
- **Exit code:** 1
- **Failure output:**
  ```
  packages/math/src/clamp.ts:24:1: error eslint(no-eval): eval can be harmful.
  ```

## Gate 6: format:check

- **Verdict:** FIRES
- **Specimen:** Append `const     x     =     1;` (excessive whitespace) to `packages/math/src/clamp.ts`
- **Exit code:** 1
- **Failure output:**
  ```
  Checking formatting...
  ```

## Gate 7: order:check

- **Verdict:** FIRES
- **Specimen:** Swap exported functions `saturate` and `inRange` in `packages/math/src/clamp.ts` (breaking alphabetical order)
- **Exit code:** 1
- **Failure output:**
  ```
  ! 1 order issue found
  ```

## Gate 8: exports:check

- **Verdict:** FIRES
- **Specimen:** Create `packages/math/src/lerp.ts` with exported `dummyUntested()`, add re-export to `index.ts` (no test file)
- **Exit code:** 1
- **Failure output:**
  ```
  packages/math/src/lerp.ts — exports: dummyUntested | ✗ 1 file missing a test file or a matching describe name
  ```

## Gate 9: reachability:check

- **Verdict:** FIRES
- **Specimen:** Rename `registerGlKuwaharaEffect` to `installGlKuwaharaEffect` in `packages/effects-gl/src/glKuwaharaEffect.ts` and its re-exports
- **Exit code:** 1
- **Failure output:**
  ```
  ✗ effects-gl defaultGlKuwaharaEffectRunner [missing-registration] real built-in runner requires
    registerGlKuwaharaEffect; delete the runner if it is not real
  effects-gl registerGlKuwaharaEffect [LOST]
  ```

## Gate 10: type-home:check

- **Verdict:** FIRES
- **Specimen:** Add `export interface BadExportedInterface { x: number; y: number; }` to `packages/node/src/index.ts`
- **Exit code:** 1
- **Failure output:**
  ```
  1 packages, 1 exported types still outside @flighthq/types
  ```

## Gate 11: portable:check

- **Verdict:** FIRES
- **Specimen:** Add `const _portableViolation = eval('1 + 1');` to `packages/node/src/boundsRectangle.ts`
- **Exit code:** 1
- **Failure output:**
  ```
  ! 1 portable-subset escape — not lowerable to a compiled target
  ! packages/node/src/boundsRectangle.ts:1 `eval()` — dynamic code execution has no compiled-target equivalent
  ```

## Gate 12: mocks:check

- **Verdict:** FIRES
- **Specimen:** Add `vi.mock('./boundsRectangle');` at top level in `packages/node/src/boundsRectangle.test.ts`
- **Exit code:** 1
- **Failure output:**
  ```
  ! 2 mock-hygiene violations — these leak across files under isolate:false
  ! packages/node/src/boundsRectangle.test.ts:2 top-level vi.mock() — hoists above imports and
    leaks across files under isolate:false
  ```

## Gate 13: backend-prefix:check

- **Verdict:** FIRES
- **Specimen:** Rename `registerGlKuwaharaEffect` to `registerKuwaharaGlEffect` (wedging `Gl` inside the type name) in `packages/effects-gl/src/glKuwaharaEffect.ts` and `index.ts`
- **Exit code:** 1
- **Failure output:**
  ```
  ! 1 registrar name split a type around a backend token
  ! packages/effects-gl/src/glKuwaharaEffect.ts registerKuwaharaGlEffect — "GlEffect" is not a type
    in @flighthq/types; move the backend token to the front of the type name
  ```

## Gate 14: api:check

- **Verdict:** FIRES
- **Specimen:** Add `export function isDefinitelyPositive(n: number): number` to `packages/math/src/numberTheory.ts` — an `is*` accessor returning `number` instead of `boolean`
- **Exit code:** 1
- **Failure output:**
  ```
  ! 1 API issue found
    ! [accessor] @flighthq/math isDefinitelyPositive is named like a boolean accessor but returns number
  ```

## Gate 15: docs:check

- **Verdict:** FIRES
- **Specimen:** Append 5000 characters of padding to `AGENTS.md`, pushing it over the 40,000 character budget
- **Exit code:** 1
- **Failure output:**
  ```
  1 documentation contract violations
    AGENTS.md is 3,604 characters OVER budget (43,604 / 40,000 characters)
  ```

## Gate 16: append-only-ledgers:check

- **Verdict:** FIRES
- **Specimen:** Delete the line `- **2026-07-03 -- Reversed-Z / infinite-far perspective in scope.**` from the `## Decisions` section of `agents/packages/camera/charter.md`
- **Exit code:** 1
- **Failure output:**
  ```
  Append-only ledgers (1534 guarded lines across 285 sections)
    baseline: merge-base with origin/develop (5d00797fd), 5 commits of work in flight
  ```

## Gate 17: facets:check

- **Verdict:** FIRES
- **Specimen:** Change `SceneTextureSourceKind` value in `packages/types/src/RequirementFacet.ts` from `'scene.texture-source-kind'` to `'scene.texture-source-kind-STALE'`
- **Exit code:** 1
- **Failure output:**
  ```
  stale, run `npm run facets`:
    packages/types/src/RequirementFacet.ts
  ```

## Gate 18: catalog:check

- **Verdict:** FIRES
- **Specimen:** Append `STALE EDIT` to a comment in `packages/registry-catalog/src/builtInRegistryCatalogEntries.ts`
- **Exit code:** 1
- **Failure output:**
  ```
  stale, run `npm run catalog`:
    packages/registry-catalog/src/builtInRegistryCatalogEntries.ts
  ```

## Gate 19: support:check

- **Verdict:** FIRES
- **Specimen:** Change heading in `agents/support-matrix.md` from `# Flight SDK -- Backend Support Matrix` to `# Flight SDK -- Backend Support Matrix STALE`
- **Exit code:** 1
- **Failure output:**
  ```
  support:check -- agents/support-matrix.md is stale. Run `npm run support`.
  ```

## Gate 20: capabilities:check

- **Verdict:** FIRES
- **Specimen:** Change label in `agents/packages/swf/capabilities.json` from `audio: DefineSound` to `audio: DefineSound STALE`
- **Exit code:** 1
- **Failure output:**
  ```
  stale, run `npm run capabilities`:
    agents/packages/swf/capabilities.json
  ```

## Gate 21: instrumentation:check

- **Verdict:** FIRES
- **Specimen:** Rename `fireProven` field to `firePROVEN_STALE` in `agents/packages/swf/instrumentation.json`
- **Exit code:** 1
- **Failure output:**
  ```
  ✗ stale, run `npm run instrumentation`: agents/packages/swf/instrumentation.json
  ```

## Gate 22: capabilities:sites:check

- **Verdict:** FIRES
- **Specimen:** Append `STALE_MUTATION` to `agents/packages/swf/diagnostic-sites.md`
- **Exit code:** 1
- **Failure output:**
  ```
  ✗ stale, run `npm run capabilities:sites`: agents/packages/swf/diagnostic-sites.md
  ```

## Gate 23: capabilities:numbers

- **Verdict:** FIRES
- **Specimen:** Change `count is **82**` to `count is **99**` in `agents/packages/swf/individuation.md` (staling a doc number against its recomputed value from `capabilities.capabilities.length`)
- **Exit code:** 1
- **Failure output:**
  ```
  ✗ doc numbers are stale against recomputation: individuation.md: committed capability count —
    recomputed value expects the text "count is **82**"
  ```

## Gate 24: fingerprint-computation-id:check

- **Verdict:** FIRES
- **Specimen:** Change `BITMAP_FINGERPRINT_COMPUTATION_ID` from `'grid-average-rgb-v1'` to `'grid-average-rgb-v2-STALE'` in `packages/bitmap/src/bitmapFingerprint.ts`
- **Exit code:** 1
- **Failure output:**
  ```
  49 violations: fingerprint computationId mismatch — baseline has 'grid-average-rgb-v1',
    current is 'grid-average-rgb-v2-STALE'
  ```

## Gate 25: evidence:check

- **Verdict:** FIRES
- **Specimen:** Add fake target `"fake-scene-that-does-not-exist/webgl": ["fingerprint", "screenshot"]` to `scripts/capture-baseline-coverage-manifest.json`
- **Exit code:** 1
- **Failure output:**
  ```
  - fake-scene-that-does-not-exist/webgl#fingerprint (pinned, target no longer exists)
  - fake-scene-that-does-not-exist/webgl#screenshot (pinned, target no longer exists)
  Capture evidence does not match scripts/capture-baseline-coverage-manifest.json
  ```

## Gate 26: data-cast-colour:check

- **Verdict:** FIRES
- **Specimen:** Add `interface BadCastTarget { color: number; }` and a `.data as BadCastTarget` cast to `packages/node/src/boundsRectangle.ts`
- **Exit code:** 1
- **Failure output:**
  ```
  1 cast target(s) carry a colour field:
    ✗ packages/node/src/boundsRectangle.ts · BadCastTarget.color
  ```

## Gate 27: expected-image-descriptions:check

- **Verdict:** FIRES
- **Specimen:** Replace `declareExpectedImageDescription()` multi-line description with empty string `''` in `functional/scenes/application-render-view.webgl.ts` (keeps the call reachable, but description is empty)
- **Exit code:** 1
- **Failure output:**
  ```
  expectedImageDescription: 496/496 cells reachable, 0 structurally unable

  1 scene(s) missing expectedImageDescription:
    ✗ application-render-view.webgl
  ```
- **Secondary finding (foreman-9e62dc3f):** Renaming `declareExpectedImageDescription` to `declareExpectedImageDescriptionXXX` makes the cell "structurally unable" (not "missing"), so the gate stays green (exit 0, 496/496 accounted for: 495 described + 0 withheld + 1 structurally unable). This is a false-green path — the gate cannot detect description removal when it is done by removing the function call rather than emptying its argument.

## Gate 28: functional-antialiasing:check

- **Verdict:** FIRES
- **Specimen:** Remove `declareAntialiasingPolicy('aa')` call from `functional/scenes/effect-kuwahara.webgl.ts`
- **Exit code:** 1
- **Failure output:**
  ```
  (gate reports the removed declaration as an unexpected missing policy, exit 1)
  ```
- **Note:** The gate also prints report-only `≠` mismatches for WebGPU cells that declare `aa` but effectively get `no-aa` (WebGPU has no multisample path yet). These are advisory and do not set the exit code on the clean tree (exit 0 on clean).

## Gate 29: degree-constants:check

- **Verdict:** FIRES
- **Specimen:** Append `const LOCAL_DEG_TO_RAD = Math.PI / 180;` to `packages/node/src/boundsRectangle.ts` (non-math package)
- **Exit code:** 1
- **Failure output:**
  ```
  ✗ 1 local degree/radian constant(s) outside @flighthq/math (5166 files scanned):
    - packages/node/src/boundsRectangle.ts:330 — const LOCAL_DEG_TO_RAD = Math.PI / 180;
    Import DEG_TO_RAD / RAD_TO_DEG from @flighthq/math instead.
  ```
