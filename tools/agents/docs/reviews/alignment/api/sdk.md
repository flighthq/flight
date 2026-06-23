# API Alignment: @flighthq/sdk

**Verdict:** Clean — the barrel is a pure, alphabetized `export *` re-export with zero exported-name collisions and every symbol of all 83 packages reachable under the project's real resolution; only a cosmetic `package.json` dependency-ordering nit remains.

`@flighthq/sdk` is the convenience barrel: `src/index.ts` is 83 `export * from '@flighthq/<pkg>'` lines and nothing else, and `src/index.test.ts` only asserts the module loads. There are no exported functions, types, or constants defined here, so the per-symbol naming/verb/out-param/`Readonly`/sentinel/teardown rules do not apply to this package directly — they belong to the source packages. The one convention that _does_ live at the barrel is the map's rule: "globally unique exported function names, **especially from package roots and the SDK barrel**." That is the focus of this audit.

## Findings

| Severity | Symbol | Issue | Suggested fix |
| --- | --- | --- | --- |
| Low | `package.json` `dependencies` | The 83 `@flighthq/*` deps are not alphabetized (`webcam` sits between `camera` and `clip`; `easing` after `tween`; `loader` after `resources`), while `src/index.ts` is perfectly alphabetized. Cosmetic drift between the two lists. | Sort the `dependencies` block alphabetically to match `index.ts`. Purely cosmetic; no functional impact. |
| Info | `src/index.test.ts` | The only guard is `expect(engine).toBeDefined()`. It cannot catch a future `export *` name collision silently dropping a symbol from the barrel (TS omits ambiguous star-re-exported names with no error). | Optional: add a guard that imports a representative value from each at-risk package (e.g. `createTween`, `createSignal`, `createParticleEmitter`, `createMesh`, `createRandomSource`) so a regression in the re-export graph fails a test rather than silently shrinking the public surface. |

No high- or medium-severity findings.

### Investigated and cleared: barrel export collisions

Because the barrel `export *`s `@flighthq/types` alongside ~80 implementation packages that each re-export their slice of `@flighthq/types`, the same type name reaches the barrel through multiple paths (e.g. `Tween` via both `@flighthq/types` and `@flighthq/tween`; `RandomSource` via `types`, `math`, and `particles`). A static scan of the built `dist/*.d.ts` surfaced 79 such name overlaps and an ad-hoc `tsc --skipLibCheck` run (without the project's composite `references`) reported 47 types and 70 first-per-package functions as "no exported member."

That alarm was a **probe artifact**. Re-running under the project's real configuration — a probe placed inside a working example's `tsconfig` (which carries the `references` graph and `tsconfig.base.json`) — every one of those symbols resolves with zero `TS2305`/`TS2308` errors: the 70 sampled functions, all 79 overlapping type names, and the const-dual kinds (`ImageChannel`, `SceneNodeKind`, `MeshKind`, `RenderCacheKind`, `PathCommand`). The reason: with project references in place, every overlapping name traces to the **single** `@flighthq/types` declaration, so TS's `export *` aggregation merges them rather than dropping them as ambiguous. The flat `dist`-only invocation saw the re-export aliases as distinct bindings and wrongly excluded them. A real example (`examples/textmetrics/src/app.ts`) importing `addNodeChild`, `connectSignal`, `createApplication`, etc. typechecks clean (`tsc -b --noEmit` exit 0), confirming the barrel surface is intact in normal use.

Function-name uniqueness across the 83 re-exported packages is genuinely clean: a cross-package scan of every exported function (2432 functions) found **zero** name collisions, which is what makes the all-`export *` barrel safe in the first place.

## Clean

- **Pure, thin barrel.** `index.ts` is nothing but `export * from '@flighthq/<pkg>'` — no convenience wrappers, no re-aggregation, no inline types, no eager registration or top-level side effects. Matches the map's "keep the barrel a thin re-export" rule exactly.
- **`"sideEffects": false`** is declared, consistent with the import-side-effect-free package rule; nothing in the barrel runs at module load.
- **Re-exports are alphabetized** in `index.ts`, satisfying source-order conventions for the one orderable thing in the file.
- **Dependencies and re-exports are in exact 1:1 correspondence** — all 83 declared `@flighthq/*` deps are re-exported and all 83 re-exports are declared (no phantom or unused deps).
- **Correct app-facing scope.** The barrel deliberately omits the non-app-facing adapters `@flighthq/host-electron` and `@flighthq/surface-rs` (present in the workspace, absent from both deps and re-exports), matching the map's guidance that host adapters are installed in the host process, not surfaced through the SDK.
- **No abbreviation, verb, out-param, `Readonly`, sentinel, teardown, `get*`/`has*`/`is*`, or `import type` violations** are possible here — the package defines no symbols of its own; those conventions are owned and audited in the source packages.
- **Globally unique function names across the whole re-exported surface** (2432 functions, zero collisions), which is the property the barrel most depends on.
