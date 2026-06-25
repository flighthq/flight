# @flighthq/lighting — status

## 2026-06-25 — builder R2-4 lost-source recovery

The integration curation pruned three modules from `packages/lighting/src/` that the gitignored `dist/` build output proves had compiled. Recovered via the camera pattern (merge `dist/<m>.js` impl + comments with `dist/<m>.d.ts` types; reconstruct tests from `dist/<m>.test.js`).

### Recovered

- **`colorFromKelvin`** — `createColorFromKelvin(kelvin)`: packed sRGBA from a color temperature in Kelvin (Tanner Helland piecewise approximation; clamped 1000–40000 K, opaque alpha). No type imports; 6 tests.
- **`lightAnalysis`** — `getLightInfluenceBounds(out, light)`, `getLightLuminance(light)`, `hasLightInfluenceOnBounds(light, bounds)`, `isLightShadowCasting(light)`: world-space influence sphere (sentinel radius -1 for non-spatial / infinite-range lights), BT.709 perceptual luminance, sphere-sphere influence overlap test, and shadow-casting query. Imports `createBoundingSphere` from `@flighthq/geometry` and the light `*Kind` strings + `BoundingSphereLike`/`Light` types from `@flighthq/types` (all present). Module-level `scratchSphere` kept at the bottom. 28 tests.

Both added to `src/index.ts` (alphabetized) — `colorFromKelvin` after `areaLight`, `lightAnalysis` after `hemisphereLight`.

### Parked

- **`lightIntensity`** — `getDirectionalLightLux` / `getPointLightCandela` / `getPointLightLumens` / `getSpotLightCandela` / `getSpotLightLumens` and the matching `set*` (lumen/candela/lux photometric conversions). The impl reads and writes an `intensityUnit` field (`'Lux'` / `'Candela'` / `'Lumen'`) on `DirectionalLight`, `PointLight`, and `SpotLight`. That field — and the unit string union it implies — does not exist anywhere in `packages/types/src/` (the three light interfaces carry only `intensity: number`). Reason parked: **needs `intensityUnit` field + unit union on the light types in `@flighthq/types`**, which is outside this task's hard boundary (`@flighthq/types` must not be edited here). No source written for this module.

### Fossils skipped

None. None of the three dist modules implements any of the deliberately-dropped concepts (DisplayObject cacheAsBitmap/scrollRect/opaqueBackground, OpenFL Loader, Stage setters, Bitmap pixelSnapping/sourceRectangle, Video smoothing) — all are genuine lighting work.

### Test result

`npm run test --workspace=packages/lighting` — 9 files, 57 tests, all pass.

## 2026-06-25 — builder R2-4 second-pass recovery

Second pass after ~94 lost types were restored into `@flighthq/types`. Compared `dist/*.js` exported functions against `src/` and recovered the per-function gaps in existing modules. The first pass had recovered each module's `clone*`/`create*` (deliberately stripping the dropped `decay`/`enabled`/`intensityUnit`/`spotBlend` fields the older `dist` build carried, which are absent from the current light types); this pass adds the orientation/direction setters and cone-degree getter that touch only fields present on the current types.

### Recovered

- **`areaLight`** — `setAreaLightOrientation(out, direction, right, up)`: writes normalized `direction`/`right`/`up`, preserving each axis's existing half-extent length (only the directions are updated; zero-length inputs ignored; alias-safe). Added `normalizeVector3`/`setVector3` to the `@flighthq/geometry` import. 2 tests.
- **`directionalLight`** — `setDirectionalLightDirection(out, x, y, z)` and `setDirectionalLightTarget(out, fromX, fromY, fromZ, toX, toY, toZ)`: write a normalized direction into `out.direction` (from raw components, or from a from→to segment). Added `setVector3` to the geometry import. 4 tests.
- **`spotLight`** — `getSpotLightConeDegrees(out, source)` (reads `innerConeCos`/`outerConeCos` back to degrees into a package-local `SpotLightConeAngles` struct), `setSpotLightDirection(out, x, y, z)`, `setSpotLightTarget(out, targetX, targetY, targetZ)` (derive `direction` from position→target). Defined the `SpotLightConeAngles` interface locally (it lives in the package's own d.ts, not `@flighthq/types`). Added `setVector3` to the geometry import. 6 tests.

No `src/index.ts` change needed — all three are existing, already-exported modules.

### Parked

- **`lightIntensity`** — still parked, same reason as the prior pass: every function reads/writes an `intensityUnit` field on `DirectionalLight`/`PointLight`/`SpotLight`, and `intensityUnit` is still absent from `packages/types/src/` (verified: no match for `intensityUnit` anywhere under types). The `LightUnit` union exists but no light interface carries the field. Reason: **needs `intensityUnit` field on the light types in `@flighthq/types`** — outside this task's hard boundary.
- **`spotLight` → `setSpotLightBlend(out, blend)`** — writes `out.spotBlend` (clamped [0,1]); `spotBlend` is absent from the `SpotLight` type (verified: no match under types). Reason: **needs `spotBlend` field on `SpotLight` in `@flighthq/types`**. Its dist tests were also skipped. The other spotLight setters were recoverable because they touch only `direction`/`position` (present).

### Fossils skipped

None. All gaps are genuine 3D lighting work (orientation/direction setters, photometric conversions); none implements a deliberately-dropped DisplayObject/OpenFL concept.

### Test result

`npm run test --workspace=packages/lighting` — 9 files, 69 tests, all pass.
