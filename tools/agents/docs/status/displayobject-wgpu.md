# @flighthq/displayobject-wgpu status

## 2026-06-25 — builder R2-4 lost-source recovery

The integration curation pruned `src/` while the gitignored `dist/` retained more compiled modules. Three whole modules had `dist/*.js` with no `src/*.ts` counterpart. No existing src file was missing any of its dist exports (compared export-by-export).

### Recovered

- `wgpuRendererData` — `createWgpuRendererData<T>(data)` / `getWgpuRendererData<T>(data)`: the typed double-cast helpers for storing/reading per-renderer data in a `RendererData` slot. Restored `wgpuRendererData.ts` + `wgpuRendererData.test.ts`. Type `RendererData` confirmed present in `@flighthq/types`.
- `wgpuRegistration` — `registerWgpuDisplayObjectRenderers(state)` / `registerWgpuSpriteRenderers(state)`: convenience wrappers that register every built-in display-object / sprite-graph kind renderer plus the default material on a `WgpuRenderState`. Restored `wgpuRegistration.ts` + `wgpuRegistration.test.ts`. All imported sibling `default*Renderer` exports and `*Kind` identifiers confirmed present in src/types.

Both added to `src/index.ts` (`export * from './wgpuRegistration'` and `./wgpuRendererData`), kept alphabetized.

### Fossils skipped

- (none) — no recovery candidate implemented a deliberately-dropped concept.

### Parked

- `wgpuRenderStats` — `getWgpuRenderStats` / `recordWgpuBatchFlush` / `recordWgpuTextureUpload` / `resetWgpuRenderStats`. Genuine functionality (a per-state GPU draw-stats accumulator), but its return/param type `WgpuRenderStats` is **not present** in `packages/types/src/` (no `WgpuRenderStats.ts`). Recovery would require editing `@flighthq/types`, which is outside the hard boundary for this task. Parked pending that type.

### Test result

`npm run test --workspace=packages/displayobject-wgpu`: 26 files, **132 tests passed**.

## 2026-06-25 — builder R2-4 second-pass recovery

The first pass parked `wgpuRenderStats` for "needs type `WgpuRenderStats`". The parallel types-recovery pass has since restored both `WgpuRenderStats` and `WgpuRenderState` to `packages/types/src/` (both present and exported from the types barrel), so the parked module is now recoverable. Re-compared every `dist/*.js` export against `src/*.ts`: `wgpuRenderStats` was the only remaining gap; all other modules match export-by-export.

### Recovered

- `wgpuRenderStats` — `getWgpuRenderStats(state)` / `recordWgpuBatchFlush(state, instances)` / `recordWgpuTextureUpload(state)` / `resetWgpuRenderStats(state)`: a per-`WgpuRenderState` GPU draw-stats accumulator (draw calls, instances, batch flushes, texture uploads) held in a module-level `WeakMap` so it GCs with the state. `record*` are no-ops until the accumulator is initialized via `get*`/`reset*`. Restored `wgpuRenderStats.ts` + `wgpuRenderStats.test.ts`; the internal `ensureWgpuRenderStatsMutable` helper and the `_stats` WeakMap sit at the bottom after the exported functions, with a local `Mutable<T>` alias to write the `Readonly` `WgpuRenderStats` fields. Added `export * from './wgpuRenderStats'` to `src/index.ts`, kept alphabetized.

### Fossils skipped

- (none) — the only recovery candidate is genuine functionality.

### Parked

- (none) — nothing remains parked for this package.

### Test result

`npm run test --workspace=packages/displayobject-wgpu`: 27 files, **140 tests passed** (was 26 files / 132 tests; +1 file, +8 tests from `wgpuRenderStats`).
