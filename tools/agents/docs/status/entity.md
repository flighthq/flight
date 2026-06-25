# @flighthq/entity — status

## 2026-06-25 — builder R2-4 lost-source recovery

The integration curation pruned `src/` below what the gitignored `dist/` build output proves existed. Recovered the missing source by merging `dist/<m>.js` (implementation + verbatim comments) with `dist/<m>.d.ts` (type signatures), the validated "camera pattern".

### Recovered modules

- **`clone`** — `cloneEntity` (allocates a fresh unbound clone, runtime slot reset to `undefined`) and `stripEntityRuntime` (returns a plain object with the `EntityRuntimeKey` slot removed for serialization). Reconstructed `src/clone.ts` and `src/clone.test.ts`; added `export * from './clone'` to `index.ts`.
- **`guards`** — `areEntityRuntimeGuardsEnabled`, `createGuardedEntity`, `createGuardedEntityRuntime`, `enableEntityRuntimeGuards`. Opt-in, tree-shakable dev guard mode using `Proxy` to warn on direct `EntityRuntimeKey` / `EntityRuntime.binding` writes. Reconstructed `src/guards.ts` and `src/guards.test.ts`; added `export * from './guards'` to `index.ts`.

### Recovered function on an existing module

- **`runtime.hasEntityRuntime`** — predicate returning `true` when the entity's runtime slot is allocated. Not present in `dist/runtime.{js,d.ts}` (the runtime dist artifact predates the prune of this function), but the validated `dist/clone.test.js` imports it from `./runtime`, proving it existed in the original `runtime.ts`. Its semantics are fully constrained by usage (`false` for fresh/cloned entities, `true` after `attachEntityBinding`). Added the function to `src/runtime.ts` (alphabetized after `getEntityRuntime`) and a colocated `describe('hasEntityRuntime')` block to `src/runtime.test.ts`.

### Types

All depended-upon types (`Entity`, `EntityRuntime`, `EntityWithoutRuntime`, `EntityRuntimeKey`) are already present in `@flighthq/types` (`packages/types/src/Entity.ts`). No `@flighthq/types` edits were needed; nothing parked for missing types.

### Fossils skipped

None. Neither recovered module touches a deliberately-dropped concept (cacheAsBitmap, scrollRect, the OpenFL Loader, Stage frameRate/quality setters, Bitmap pixelSnapping, Video smoothing, etc.).

### Parked

None.

### Test result

`npm run test --workspace=packages/entity` — 5 files, 29 tests, all passing.
