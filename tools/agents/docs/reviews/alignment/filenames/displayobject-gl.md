# Filename Alignment: @flighthq/displayobject-gl

**Verdict:** Backend-variant package (`-gl`), so every source file must be `gl`-prefixed PREFIX-FIRST — and all 25 are. Filenames are almost entirely domain/object-named and self-describing; the one real flaw is `glMaterials.ts`, a generic plural name whose contents are actually the color-transform shader, not a materials grab-bag.

## Findings

| File | Issue | Suggested rename |
| --- | --- | --- |
| `glMaterials.ts` | Generic plural name overpromises a "materials" domain it does not cover. Contents are only `getGlRenderProxyColorTransform` + `registerGlColorTransformShader` (compiles/registers the color-transform bitmap shader). The actual material renderers live in dedicated files (`glDefaultMaterial.ts`, `glColorTransformMaterial.ts`, `glUniformColorTransformMaterial.ts`), so this name both misdescribes its own body and conceptually collides with the real `*Material.ts` siblings. | `glColorTransformShader.ts` (names the object it builds; matches its `registerGlColorTransformShader` export). |

## Clean

All other 24 source files name their domain or object PREFIX-FIRST and pass the remove-the-folder test:

- Display-object leaves: `glBitmap.ts`, `glShape.ts`, `glShapeMesh.ts`, `glScale9Shape.ts`, `glSprite.ts`, `glTilemap.ts`, `glVideo.ts`, `glDisplayObject.ts`, `glParticleEmitter.ts`, `glRichText.ts`, `glTextLabel.ts`, `glTextInput.ts`.
- Batching/rendering objects: `glQuadBatch.ts`, `glSpriteBatch.ts`, `glSpriteRenderer.ts`.
- Material objects: `glDefaultMaterial.ts`, `glColorTransformMaterial.ts`, `glUniformColorTransformMaterial.ts`.
- Clip domain: `glClip.ts` (enable/setup anchor), `glClipContours.ts`, `glClipRectangle.ts` — three legitimate clip-domain files, not a single-function split.
- Other domains/objects: `glCache.ts`, `glVelocity.ts`, `glScale9Mapper.ts` (names the `Scale9Mapper` object even though it has one builder export — object-named, not function-named).

Single-export files such as `glClip.ts` and `glScale9Mapper.ts` are not flagged: they name a domain/object (clipping; the `Scale9Mapper`), not a lone function. No generic dumping-ground names (`data.ts`, `utils.ts`, `helpers.ts`, etc.) exist. Tests are colocated `<source>.test.ts` for every source file, mirroring filenames exactly. `index.ts` is a barrel and is exempt.
