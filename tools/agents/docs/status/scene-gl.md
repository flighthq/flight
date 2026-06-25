# scene-gl status

## 2026-06-25 — builder R2-4 lost-source recovery

Recovered lost source by merging gitignored `dist/` build output (`.js` impl + comments, `.d.ts` types, `.test.js` tests) back into `src/`.

### Recovered

- **glMeshUpload.ts — `hasGlMeshGeometryUv1(geometry: Readonly<MeshGeometry>): boolean`** One exported function present in `dist/glMeshUpload.js` / `.d.ts` but missing from `src/glMeshUpload.ts`. Returns true when a mesh geometry's vertex layout carries a `uv1` semantic (glTF TEXCOORD_1); material renderers use it to drive the `hasUv1` shader-define flag at bind time. Restored impl (with its verbatim `//` comment block) and the `hasGlMeshGeometryUv1` test `describe` block (3 cases) reconstructed from `dist/glMeshUpload.test.js`. Imports already covered by the existing file (`MeshGeometry` from `@flighthq/types`); no new types required. Module already exported via `export * from './glMeshUpload'` in `index.ts`, so no index change.

### Fossils skipped

None. No dropped/deprecated-concept modules found in `dist/`.

### Parked

None. The single recovery candidate needed no types absent from `@flighthq/types`.

### Notes

- Every other `dist/*.js` module had a complete `src/*.ts` counterpart with matching exported functions; the curation only pruned this one function from an otherwise-intact module.
- `dist/glSceneTestHelper.js` has a `src/` counterpart but is intentionally absent from `index.ts` (test helper, not public API) — not a recovery candidate.

### Tests

`npm run test --workspace=packages/scene-gl` — 37 files, 195 tests, all passing.
