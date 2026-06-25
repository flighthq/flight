# @flighthq/particles — status

## 2026-06-25 — builder R2-4 second-pass recovery

The parallel type-recovery pass restored `ParticleEmitterSignals` to `@flighthq/types`, unblocking one of last pass's parked modules. Recovered the remaining lost source still merge-able without editing `@flighthq/types`.

### Recovered

- **`particleEmitterSignals.ts`** (`createParticleEmitterSignals`, `enableParticleEmitterSignals`, `getParticleEmitterSignals`) — the opt-in signals module parked last pass for "needs type `ParticleEmitterSignals`". That type now exists in `packages/types/src/ParticleEmitterSignals.ts` (three `Signal<…>` slots: `onParticleSpawn`, `onParticleDeath`, `onEmitterComplete`). Merged the dist `.js` impl (per-emitter `Symbol`-keyed state slot, `createSignal` from `@flighthq/signals`) with the `.d.ts` types. Tests reconstructed from `dist/particleEmitterSignals.test.js`. Added `export * from './particleEmitterSignals'` to `src/index.ts` (alphabetized).
- **Signal-firing hooks grafted into existing `src/updateParticleEmitter.ts`** — the simulation pruned its signal emission along with the signals module. Restored the three fire points from `dist/updateParticleEmitter.js` without pulling in the still-blocked `computeParticleSpawnOffset`: `getParticleEmitterSignals(state)` lookup (null when not enabled), `signals?.onParticleDeath.emit(dx, dy)` at particle death, `signals.onParticleSpawn.emit(spawnX, spawnY, vx, vy)` at spawn, and `signals.onEmitterComplete.emit()` when `isParticleEmitterComplete` after the step. These are gated so an emitter without signals pays only one null check.
- **`lerpHsvDirect`, `lerpHsvInPlace` added to existing `src/curve.ts`** — two exported HSV-interpolation helpers (used by the `colorInterpolation: 'hsv'` path) present in `dist/curve.js` but absent from src. Merged with their `.d.ts` signatures; added the private `hsvToRgb`/`rgbToHsv` helpers at the bottom after the exported functions. Both depend only on numeric primitives / typed arrays — no missing type. Their two `describe` blocks were reconstructed from `dist/curve.test.js` and inserted alphabetized into `src/curve.test.ts`.

### Fossils skipped

None. No dist module implements a deliberately-dropped concept from the prune list.

### Parked

- **`spawnShape.ts`** (`computeParticleSpawnOffset`) — still blocked, same as last pass. The type gap was NOT closed by the type-recovery pass: `packages/types/src/ParticleEmitterConfig.ts` still declares `ParticleEmitterShape = 'point' | 'circle' | 'rect'` and `ParticleEmitterConfig` still lacks `emitterInnerRadius`, `emitterLineX2`, `emitterLineY2`, `emitterArc`, `emitFromEdge`. The recovered impl handles `ring`/`line`/`cone`/`edge` and reads those five fields, so recovering it requires widening `ParticleEmitterShape` and adding the five fields in `@flighthq/types` — forbidden by the hard boundary. The dist `updateParticleEmitter.js`/`emitParticleBurst.js`/`updateParticleObjects.js` call into this module; their src versions remain the reduced circle/rect-only fork. Rewiring is blocked by the same type gap and left untouched.
- **RGBA curve functions** (`buildParticleRgbaCurve`, `particleRgbaCurveFromKeyframes`, `particleRgbaCurveToKeyframes`, `sampleParticleRgbaCurve` in `dist/curve.js`) — need type `RgbaKeyframe` from `@flighthq/types`, which is not present (no `packages/types/src/RgbaKeyframe.ts`). The `.d.ts` imports it explicitly. Editing `@flighthq/types` is forbidden, so these four are parked. (The HSV helpers from the same file were recoverable because they take only primitives.)

### Test result

`npm run test --workspace=packages/particles` — 13 files, 164 tests, all passing (was 12/149 after the first pass; +1 file from `particleEmitterSignals.test.ts`, +15 tests from signals + lerpHsv).

## 2026-06-25 — builder R2-4 lost-source recovery

Recovered lost source by merging gitignored build output (`dist/<m>.js` impl + comments, `dist/<m>.d.ts` types, `dist/<m>.test.js` tests) back into `src/`, the validated "camera pattern".

### Recovered

- **`stepParticleEmitter.ts`** — `stepParticleEmitter` and `stepParticleObjects`: the two convenience wrappers that fold the canonical three-step update sequence (`applyParticleForces` → `updateParticleEmitter` → `applyParticleCollisions`, and the object-pool analogue) into one call. All callee functions and every referenced type (`ParticleEmitter`, `ParticleEmitterState`, `ParticleEmitterConfig`, `ParticleForce`, `ParticleCollider`, `ParticleEmitterCallbacks`, `WorldTransform2D`, `ParticleObject`, `ParticleObjectsState`, `ParticleObjectsUpdateOptions`) are present in `src/` and `@flighthq/types`. Tests reconstructed from `dist/stepParticleEmitter.test.js`. Added `export * from './stepParticleEmitter'` to `src/index.ts` (alphabetized).

### Fossils skipped

None. No dist module implements a deliberately-dropped/deprecated concept.

### Parked

- **`spawnShape.ts`** (`computeParticleSpawnOffset`) — needs `@flighthq/types` changes that the hard boundary forbids. The recovered impl handles emitter shapes `ring`, `line`, `cone`, `edge` and reads config fields `emitterInnerRadius`, `emitterLineX2`, `emitterLineY2`, `emitterArc`, `emitFromEdge`. In the pruned `@flighthq/types`, `ParticleEmitterShape` is only `'point' | 'circle' | 'rect'` and `ParticleEmitterConfig` lacks those five fields (the dist `particleEmitterConfig.js` still defaults all five, confirming they were pruned). Recovering this module requires widening `ParticleEmitterShape` and adding the five fields to `ParticleEmitterConfig` in `@flighthq/types` (plus restoring the matching defaults in `src/particleEmitterConfig.ts`). Out of scope for this package-only recovery. Note: the pruned `src/emitParticleBurst.ts`, `src/updateParticleEmitter.ts`, and `src/updateParticleObjects.ts` inline a reduced circle/rect-only spawn path; the dist versions call `computeParticleSpawnOffset`. Rewiring them is blocked by the same type gap and was left untouched.

- **`particleEmitterSignals.ts`** (`createParticleEmitterSignals`, `enableParticleEmitterSignals`, `getParticleEmitterSignals`) — needs type `ParticleEmitterSignals` in `@flighthq/types`, which is not present (no `ParticleEmitterSignals.ts`, no definition anywhere in `packages/types/src`). The hard boundary forbids editing `@flighthq/types`, so this opt-in signals module is parked.

### Test result

`npm run test --workspace=packages/particles` — 12 files, 149 tests, all passing.
