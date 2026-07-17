# shading — Status

Continuity log for `@flighthq/shading`. See [charter](charter.md) and [effect-adjustment-architecture](../../effect-adjustment-architecture.md).

## State: v1 chartered, build triggered, code NOT started (2026-07-17)

The reserved build trigger — *≥2 real features must combine on one material* — is met. The AwayJS
globe ([sdk-blocking-issues](../../sdk-blocking-issues.md) #4) stacks three features on one surface
(night-side emissive, atmospheric Fresnel rim, animated ocean normal). Per a direction session with
the user, the charter moved from **reserved** to **v1 triggered** and `draft: false`.

### Blessed decisions (see charter › Decisions, 2026-07-17)

- Build v1 now; the globe is the first real consumer.
- `@flighthq/shading` owns its **own composable base lit material** (`ShadedMaterial`, working name),
  a **third assembly over the shared light block** (`GL_MESH_LIGHT_BLOCK_GLSL` / `glLitProgram`) — not
  a third light loop, and **not** injection into `materials`' PBR/classic kinds.
- **v1 accepted cost:** modifiers do not stack on PBR-variant/classic materials; the modifier↔base
  boundary is a contract over the slot taxonomy + shared light block, so "PBR + modifiers" stays an
  additive future step.

### v1 deliverables (from the charter)

1. `ShadedMaterial` composable base over the shared light block.
2. `Modifier` descriptor + open registry keyed by feature kind.
3. Slot taxonomy: `diffuse / specular / normal / emissive / effect` (ambient/shadow reserved).
4. Composition/ordering contract (deterministic variant per feature-set).
5. Per-backend compile path (assemble base + ordered modifiers, cache by feature-set define-key).
6. Per-frame uniform seam (`time` first).
7. Three seed modifiers: emissive-with-mask, rim/Fresnel, animated normal.
8. Globe re-expressed as a composition of the three modifiers (validation).

### Before dispatch — open items to pin (charter › Open directions)

- Backend scope: recommend **gl-first** (`scene-gl`), backend-agnostic compile path, `scene-wgpu`
  fast-follow. Needs the user's confirmation.
- Names: `ShadedMaterial` / `Modifier` / slot strings / modifier-kind convention.

## No code exists yet. Types (`@flighthq/types` header layer) come first, then `scene-gl` assembly.
