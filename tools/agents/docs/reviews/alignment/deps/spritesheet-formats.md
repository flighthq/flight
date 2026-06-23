# Dependency Alignment: @flighthq/spritesheet-formats

**Verdict:** Clean — a single, predictable runtime edge (`@flighthq/spritesheet`, pinned `"*"`), no phantom or unused deps, no barrel import, tree-shakable; the one convention note (Spritesheet data types live in `@flighthq/spritesheet`, not `@flighthq/types`) is an upstream concern, not a fault of this package.

## Findings

| Severity | Dependency/edge | Issue | Fix |
| --- | --- | --- | --- |
| Info | `@flighthq/spritesheet` → `SpritesheetData` / `SpritesheetFrameData` / `SpritesheetAnimationData` | These types cross a package boundary (consumed here, defined in `@flighthq/spritesheet/src/spritesheetData.ts`). The convention says cross-package types belong in `@flighthq/types` (the header layer). They are colocated with their `create*` constructors in `@flighthq/spritesheet` instead. | Upstream decision in `@flighthq/spritesheet`: move the three data interfaces (and `SpritesheetAnimationDirection`) to `@flighthq/types`, re-export from spritesheet. Out of scope for this package — `spritesheet-formats` would still need the runtime dep for the `create*` constructors regardless, so its edge does not change. |
| Info | `@flighthq/spritesheet` (runtime, not type-only) | The dep is correctly a full runtime dependency: `asepriteParse`/`starlingParse`/`texturePackerParse` import the value functions `createSpritesheetData`, `createSpritesheetFrameData`, `createSpritesheetAnimationData` (not just types). So it cannot be demoted to a type-only edge. The type imports are correctly split into their own `import type { … }` lines per source style. | None — noting that the runtime edge is justified, not accidental. |

No boundary violations: this is a leaf utility (format import/export) depending only on its data-model owner. The mapping reads cleanly — a "spritesheet formats" package depending on `@flighthq/spritesheet` is exactly what a reader would predict. No edge reaches "up" a layer, no cross-backend coupling, no surprising edges. `"sideEffects": false` is declared; `index.ts` is a thin `export *` barrel and all format types are emitted as `import type`, so the package stays tree-shakable. No `@flighthq/sdk` import. Starling XML parsing is hand-rolled (no `DOMParser`/XML library), so there is no undeclared external runtime dependency.

## Declared vs used

- **Declared dependencies:** `@flighthq/spritesheet` (`"*"`, workspace-pinned correctly).
- **Used:** `@flighthq/spritesheet` — used (both as type source and for `create*` runtime constructors). Fully accounted for.
- **Unused declared:** none.
- **Phantom (used but undeclared):** none. All non-`@flighthq` imports are relative (`./asepriteSchema`, `./starlingSchema`, `./texturePackerSchema`); format-specific schema types (`AsepriteDocument`, `StarlingDocument`, `TexturePackerDocument`, etc.) are defined locally and are correctly _not_ in `@flighthq/types` (they model external file formats, not cross-package Flight contracts).
- **devDependencies:** `typescript ^5.3.0` only — used by `tsc -b` build; correct and minimal.
