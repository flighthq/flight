# Dependency Alignment: @flighthq/particles-formats

**Verdict:** One real defect — `@flighthq/types` is imported in 6 source files but is undeclared (phantom dependency, resolving only transitively through `@flighthq/particles`); otherwise the dependency mapping is clean and predictable.

## Findings

| Severity | Dependency/edge | Issue | Fix |
| --- | --- | --- | --- |
| High | `@flighthq/types` | Phantom dependency. Imported (`import type`) in `particleDesignerParse.ts`, `particleDesignerSerialize.ts`, `spineParse.ts`, `spineSerialize.ts`, `unityParse.ts`, `unitySerialize.ts` for `ParticleEmitterConfig`, `ParticleBlendMode`, `ParticleCurve`, `ColorKeyframe`, `CurveKeyframe`, but not in `dependencies`. It resolves today only because `@flighthq/particles` happens to depend on it transitively — a fragile edge that breaks the moment that transitive path changes. The header layer should be a direct, declared dependency. | Add `"@flighthq/types": "*"` to `dependencies` in `package.json`. |
| Info | `@flighthq/particles` | Correctly declared and genuinely used at runtime (`createParticleEmitterConfig`, `particleCurveFromKeyframes`, `particleColorCurveFromKeyframes`, `particleCurveToKeyframes`, `particleColorCurveToKeyframes`). Edge reads cleanly: a formats package converting external files into emitter configs naturally depends on the particles package. No action. | — |
| Info | `packages:check` | Passes (`86 packages and 16 examples valid`), but it does not validate used-vs-declared deps — it only enforces that declared `@flighthq/*` deps pin `"*"`. The phantom `@flighthq/types` above is invisible to it; this is the judgment-added finding. | — |

Notes on items checked and found clean:

- **No `@flighthq/sdk` import.** None present in src.
- **No inline cross-package types.** The `*Schema.ts` files define only the external file-format DTOs (Particle Designer plist, Spine, Unity emitter shapes). These are format-specific to this package, not shared SDK contracts, so they correctly live here rather than in `@flighthq/types`. Shared particle types (`ParticleEmitterConfig`, keyframes, curves) are imported from `@flighthq/types`, not redefined.
- **Workspace deps pinned `"*"`** (`@flighthq/particles`).
- **Type-only imports use `import type`** throughout; all `@flighthq/types` usage and the type-only portions of `@flighthq/particles` imports are `import type`, so no extra runtime weight. `"sideEffects": false` is declared; package stays tree-shakable.
- **Layering respected.** This is a leaf format-adapter package depending only on `particles` (its subject) and `types` (the header). No reach across renderer/backend boundaries, no upward edges.

## Declared vs used

- **Declared and used:** `@flighthq/particles` (runtime + types). `typescript` (devDependency).
- **Used but undeclared (phantom):** `@flighthq/types` — imported in 6 source files, not in `dependencies`.
- **Declared but unused:** none.
