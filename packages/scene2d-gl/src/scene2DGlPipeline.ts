import type { Kind } from '@flighthq/entity/contract';
import { StandardMaterialKind } from '@flighthq/materials/contract';
import { ParticleEmitter2DKind } from '@flighthq/particleemitter/contract';
import { tessellateStrokePath } from '@flighthq/path/contract';
import { QuadBatchKind } from '@flighthq/quadbatch/contract';
import { withKindMapEntry } from '@flighthq/registry/contract';
import {
  buildGlRenderRegistries,
  standardGlBlendRealizations,
  standardGlTextureResolvers,
} from '@flighthq/render-gl/contract';
import type { GlRenderRegistries } from '@flighthq/render-gl/contract';
import type { NodeRenderer } from '@flighthq/render/contract';
import { RenderCacheKind } from '@flighthq/render/contract';
import { DisplayObjectKind, Scale9SpriteKind, SpriteKind } from '@flighthq/scene2d/contract';
import { MorphShapeKind, Scale9ShapeKind, ShapeKind } from '@flighthq/shape/contract';
import { RichTextKind, TextLabelKind } from '@flighthq/text/contract';
import { TilemapKind } from '@flighthq/tilemap/contract';

import { glBitmapTextRenderer } from './glBitmapText.ts';
import { glRenderCacheRenderer } from './glCache.ts';
import { glScene2DRenderer } from './glNode2D.ts';
import { glParticleEmitter2DRenderer } from './glParticleEmitter2D.ts';
import { glQuadBatchRenderer } from './glQuadBatch.ts';
import { glRichTextRenderer } from './glRichText.ts';
import { glScale9ShapeRenderer } from './glScale9Shape.ts';
import { glScale9SpriteRenderer } from './glScale9Sprite.ts';
import { glShapeRenderer, glMorphShapeRenderer } from './glShape.ts';
import { glSpriteRenderer } from './glSprite.ts';
import { standardGlQuadMaterialRenderer } from './glStandardMaterial.ts';
import { glTextLabelRenderer } from './glTextLabel.ts';
import { glTilemapRenderer } from './glTilemap.ts';

function buildScene2DGlRenderers(): ReadonlyMap<Kind, NodeRenderer> {
  let table: ReadonlyMap<Kind, NodeRenderer> = new Map();
  table = withKindMapEntry(table, BitmapTextKind, glBitmapTextRenderer);
  table = withKindMapEntry(table, DisplayObjectKind, glScene2DRenderer);
  table = withKindMapEntry(table, MorphShapeKind, glMorphShapeRenderer);
  table = withKindMapEntry(table, ParticleEmitter2DKind, glParticleEmitter2DRenderer);
  table = withKindMapEntry(table, QuadBatchKind, glQuadBatchRenderer);
  table = withKindMapEntry(table, RenderCacheKind, glRenderCacheRenderer);
  table = withKindMapEntry(table, RichTextKind, glRichTextRenderer);
  table = withKindMapEntry(table, Scale9SpriteKind, glScale9SpriteRenderer);
  table = withKindMapEntry(table, Scale9ShapeKind, glScale9ShapeRenderer);
  table = withKindMapEntry(table, ShapeKind, glShapeRenderer);
  table = withKindMapEntry(table, SpriteKind, glSpriteRenderer);
  table = withKindMapEntry(table, TextLabelKind, glTextLabelRenderer);
  table = withKindMapEntry(table, TilemapKind, glTilemapRenderer);
  return table;
}

/**
 * Everything this backend needs that the CONTENT does not choose — the preset with no node renderers.
 *
 * A per-file manifest replaces exactly one part of a render configuration: the node renderers, because
 * those are what a document implies. The rest is backend machinery every build needs whatever the
 * content is, and some of it cannot be expressed as a catalog row at all. Splitting the two is what
 * lets a generated fragment compose into a COMPLETE configuration without dragging in the renderers
 * the content never asked for. See `canvasRenderInfrastructure` for the failure this prevents.
 */
export const glRenderInfrastructure: Readonly<Omit<GlRenderRegistries, 'nodeRenderers'>> = Object.freeze({
  ...buildGlRenderRegistries({}),
  blendRealizations: standardGlBlendRealizations,
  materialRenderers: withKindMapEntry(new Map(), StandardMaterialKind, standardGlQuadMaterialRenderer),
  strokeTessellator: tessellateStrokePath,
  textureResolvers: standardGlTextureResolvers,
});

export const glScene2DRenderPreset: Readonly<GlRenderRegistries> = Object.freeze({
  ...glRenderInfrastructure,
  nodeRenderers: buildScene2DGlRenderers(),
});
import { BitmapTextKind } from '@flighthq/bitmaptext/contract';
