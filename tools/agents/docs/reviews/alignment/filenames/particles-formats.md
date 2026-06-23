# Filename Alignment: @flighthq/particles-formats

**Verdict:** Clean. This is a single-implementation, multi-format package (the variants are file _formats_ — Particle Designer, Spine, Unity — not render backends), so the backend-prefix rule does not apply. Every source file names a format domain plus a concern (`parse` / `schema` / `serialize`), each covering a cohesive group of related exports rather than a single function. No renames needed.

## Findings

| File     | Issue | Suggested rename |
| -------- | ----- | ---------------- |
| _(none)_ | —     | —                |

## Clean

Files under `src/` (the package has no backend variants — format is the axis, and the format token leads every filename):

- `index.ts` — thin barrel; pure re-exports of the nine source modules, not a dumping ground.
- `particleDesignerParse.ts` — Particle Designer parse domain (4 exports: `parseParticleDesignerPlist`, `parseParticleDesignerPlistDocument`, options/parsed types).
- `particleDesignerSchema.ts` — Particle Designer document schema types (`ParticleDesignerDocument`, `ParticleDesignerEmitterType`, `ParticleDesignerRawDict`).
- `particleDesignerSerialize.ts` — Particle Designer serialize domain (2 exports).
- `spineParse.ts` — Spine parse domain (3 exports).
- `spineSchema.ts` — Spine document schema types (`SpineParticleDocument`, `SpineBlendMode`, range/keyframe types).
- `spineSerialize.ts` — Spine serialize domain.
- `unityParse.ts` — Unity parse domain (4 exports).
- `unitySchema.ts` — Unity document schema types (`UnityParticleDocument` plus its shape/emission/gradient/curve sub-types).
- `unitySerialize.ts` — Unity serialize domain (2 exports).

Tests are colocated and mirror their source basenames: `particleDesignerParse.test.ts`, `spineParse.test.ts`, `unityParse.test.ts`. (Schema and serialize modules carry no `.test.ts`; coverage of their exports is reached through the parse round-trip tests — a test-presence concern for `npm run exports:check`, not a filename-descriptiveness issue.)
