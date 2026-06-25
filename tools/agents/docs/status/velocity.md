# @flighthq/velocity — status

## 2026-06-25 — builder R2-4 lost-source recovery

The integration curation had pruned `@flighthq/velocity` src down to a thin subset; the gitignored `dist/` build output proved more source existed and compiled. Reconstructed the lost `.ts` by merging `dist/*.js` (impl + verbatim `//` comments) with `dist/*.d.ts` (types) — the validated "camera pattern".

### Recovered

- **`affineVelocity.ts`** (whole module — no src counterpart existed):
  - `contributeAffineVelocity(field, root)` — walks `root`'s subtree, deriving per-node screen-space velocity from the affine delta of the world transform (correct for rotation/scale, not just tx/ty). Mirrors `contributeTransformVelocity`'s generic `<Traits>` + trait-assertion pattern.
  - `getVelocitySampleAt(sample, currentWorldTransform, pointX, pointY, out)` — per-pixel affine reprojection `current·p − previous·p` written into `out`; returns zero when the sample has no previous transform.
  - `affineVelocity.test.ts` reconstructed (11 cases across the two `describe` blocks); types confirmed present in `@flighthq/types` (`Transform2DNode`, `Velocity2D`, `VelocityField`, `VelocitySample`).
- **`velocityField.ts`** (functions missing from the existing file): added the pure `Velocity2D`-only math/utility helpers, alphabetized into place: `addVelocity`, `clampVelocity`, `copyVelocity`, `dampVelocity`, `isVelocityZero`, `lengthOfVelocity`, `lerpVelocity`, `normalizeVelocity`, `scaleVelocity`, `subtractVelocity`, `zeroVelocity`. Tests for each added to `velocityField.test.ts`.
- **`index.ts`** updated with the new `export` lines (kept alphabetized).

### Skipped fossils

None. No recovery candidate implemented a deliberately-dropped concept.

### Parked

These dist functions were left unrecovered because they depend on fields that do not exist on the `@flighthq/types` `VelocityField` / `VelocitySample` interfaces (`packages/types/src/Velocity.ts`), and the recovery boundary forbids editing `@flighthq/types`:

- `contributeAngularVelocity(field, source, radians)` — writes `sample.angularVelocity`. **Needs `angularVelocity` on `VelocitySample`.**
- `getAngularVelocity(field, source)` — reads `sample.angularVelocity`. **Needs `angularVelocity` on `VelocitySample`.**
- `getVelocityPerSecond(field, source, out)` — divides by `field.dt`. **Needs `dt` on `VelocityField`.**
- The `dt` enhancements to `beginVelocityFrame(field, dt?)` and the `dt` initialization in `createVelocityField` were intentionally NOT applied for the same reason; the recovered versions match the current type shape (no `dt`). **Needs `dt` on `VelocityField`.**

The `dist` `ensureVelocitySample` also initialized `angularVelocity: 0`; the recovered version omits it to stay within the current `VelocitySample` shape.

Suggested follow-up (cross-package, requires a type decision): add `angularVelocity: number` to `VelocitySample` and `dt: number` to `VelocityField` in `@flighthq/types`, then recover the four parked functions and the `dt` enhancements.

### Tests

`npm run test --workspace=packages/velocity`: **3 files, 51 tests passed.**

## 2026-06-25 — builder R2-4 second-pass recovery

Re-checked `@flighthq/velocity` against `dist/` after the parallel `@flighthq/types` type-recovery pass, to see if the four items parked in the first pass had become recoverable.

### Recovered

None. The blocking type fields are still absent.

### Skipped fossils

None.

### Parked (still blocked — type fields not restored by the type-recovery pass)

The four items parked last pass remain parked for the identical reason. `packages/types/src/Velocity.ts` still defines `VelocityField` with only `{ samples, frameId }` and `VelocitySample` with only `{ previousWorldTransform, velocity, lastFrameId, explicitFrameId }`; neither `dt` nor `angularVelocity` exists anywhere in `@flighthq/types` (verified by grep). The HARD BOUNDARY forbids editing `@flighthq/types`, so these stay parked:

- `contributeAngularVelocity(field, source, radians)` — writes `sample.angularVelocity`. **Needs `angularVelocity` on `VelocitySample`.**
- `getAngularVelocity(field, source)` — reads `sample.angularVelocity`. **Needs `angularVelocity` on `VelocitySample`.**
- `getVelocityPerSecond(field, source, out)` — divides by `field.dt`. **Needs `dt` on `VelocityField`.**
- The `dt` enhancements to `beginVelocityFrame(field, dt?)`, the `dt: 1` init in `createVelocityField`, and the `angularVelocity: 0` init in `ensureVelocitySample`. **Needs `dt` on `VelocityField` and `angularVelocity` on `VelocitySample`.**

`src/index.ts` is correspondingly NOT updated with `contributeAngularVelocity` / `getAngularVelocity` / `getVelocityPerSecond` — they remain unexported because their source is parked.

Suggested follow-up (cross-package, requires a type decision): add `angularVelocity: number` to `VelocitySample` and `dt: number` to `VelocityField` in `@flighthq/types`, then recover the parked functions and the `dt`/`angularVelocity` enhancements (plus their tests already present in `dist/velocityField.test.js`).

### Tests

`npm run test --workspace=packages/velocity`: **3 files, 51 tests passed.** (Unchanged; no source edited this pass.)
