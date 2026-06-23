# Filename Alignment: @flighthq/velocity

**Verdict:** Clean — single-implementation domain package (not a backend-variant; the GL/WGPU velocity writers live in separate `displayobject-gl` / `displayobject-wgpu` / `effects-*` packages, so no backend prefix applies here). Both source filenames name a domain/object and pass the remove-the-folder test.

## Findings

| File     | Issue | Suggested rename |
| -------- | ----- | ---------------- |
| _(none)_ | —     | —                |

## Clean

- `src/velocityField.ts` — names the `VelocityField` object it operates over; hosts the full field surface (`createVelocityField`, `getVelocity`, `hasVelocity`, `contributeVelocity`, `ensureVelocitySample`, `beginVelocityFrame`, `suppressVelocity`). Object-named, not a single-function file.
- `src/transformVelocity.ts` — names the transform-delta velocity domain (the "any transform is velocity" baseline contributor); concept/domain name, not a bare verb. Mirrors `contributeTransformVelocity`.
- `src/index.ts` — barrel re-export; conventional, exempt from the descriptiveness rule.
- `src/velocityField.test.ts`, `src/transformVelocity.test.ts` — colocated tests mirroring their source filenames.

No generic dumping-ground names (no `data.ts` / `utils.ts` / `helpers.ts` / `math.ts` / `common.ts`).
