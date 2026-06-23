# Filename Alignment: @flighthq/texture

**Verdict:** Clean. This is a single-implementation domain package (not a backend-variant package), so no backend prefix is expected; all three source files take plain object names (`texture.ts`, `sampler.ts`, `cubeTexture.ts`) that name the entity they own, and tests are colocated and mirrored.

## Findings

| File     | Issue | Suggested rename |
| -------- | ----- | ---------------- |
| _(none)_ | —     | —                |

## Clean

- `texture.ts` — names the `Texture` entity; holds `createTexture`/`cloneTexture`/`copyTexture`/`isTextureReady`/`setTextureImage`. Object-named, self-describing.
- `sampler.ts` — names the `Sampler` entity; holds `createSampler`/`cloneSampler`/`copySampler`/`equalsSampler`. Object-named, self-describing.
- `cubeTexture.ts` — names the `CubeTexture` entity; holds `createCubeTexture`/`cloneCubeTexture`. Object-named, self-describing.
- `index.ts` — thin barrel re-exporting the three modules; no dumping-ground content.
- `texture.test.ts`, `sampler.test.ts`, `cubeTexture.test.ts` — colocated tests mirroring each source filename.
