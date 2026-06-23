# Dependency Alignment: @flighthq/particles

**Verdict:** Clean except one misclassified dependency — `@flighthq/math` is declared as a runtime `dependency` but is used only in test files, and should move to `devDependencies`.

## Findings

| Severity | Dependency/edge | Issue | Fix |
| --- | --- | --- | --- |
| Medium | `@flighthq/math` | Declared in `dependencies`, but `createRandomSource` is imported only in `.test.ts` files (`particleEmitterState.test.ts`, `updateParticleObjects.test.ts`, `emitParticleBurst.test.ts`). No non-test source imports it. Runtime code consumes the `RandomSource` _type_ from `@flighthq/types` and never constructs one — the concrete RNG is a test fixture. This ships an unnecessary runtime edge. `packages:check` passes regardless because it does not distinguish test-only imports. | Move `"@flighthq/math": "*"` from `dependencies` to `devDependencies`. Precedent exists in-repo (e.g. `interaction`, `render`, `scene`, `velocity` all keep test-only `@flighthq/*` edges in `devDependencies`). |
| Info | `@flighthq/sprite` | Surprising-at-first edge (particles → sprite), but correct: the emitter is realized as a sprite-graph batch node and `reserveParticleEmitter` lives in `sprite`. Reads cleanly given the package purpose. | None. |

All other checks pass:

- No import of `@flighthq/sdk` barrel.
- No inline cross-package types — every type (`ParticleEmitter`, `ParticleEmitterConfig`, `ParticleEmitterState`, `ParticleObjectsState`, `ParticleCurve`, `ColorKeyframe`, `CurveKeyframe`, `ParticleBlendMode`, `ParticleEmitterShape`, `ParticleConfigIssue`, `RandomSource`) comes from `@flighthq/types`.
- Type-only imports use `import type`; all `@flighthq/types` edges are type-only and pull no runtime weight.
- `"sideEffects": false` declared; package stays tree-shakable.
- All workspace deps pinned `"*"`.
- Layering respected: depends on the header (`types`) plus value helpers from `geometry` (`reserveFloat32Array`), `node` (`invalidateNodeLocalBounds`), and `sprite` (`reserveParticleEmitter`). No reach across renderer/backend boundaries; nothing reaches "up" a layer.

## Declared vs used

**Runtime source imports (non-test):**

- `@flighthq/geometry` — `reserveFloat32Array` (value) — declared, used.
- `@flighthq/node` — `invalidateNodeLocalBounds` (value) — declared, used.
- `@flighthq/sprite` — `reserveParticleEmitter` (value) — declared, used.
- `@flighthq/types` — type-only — declared, used.

**Unused (as a runtime dependency):**

- `@flighthq/math` — declared in `dependencies` but imported only by test files. Phantom runtime dependency; belongs in `devDependencies`.

**Phantom (used but undeclared):** none. `@flighthq/math` is declared, just in the wrong section.
