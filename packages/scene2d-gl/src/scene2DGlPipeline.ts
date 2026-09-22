import { tessellateStrokePath } from '@flighthq/path/contract';
import { withKindMapEntry } from '@flighthq/registry/contract';
import {
  buildGlRenderRegistries,
  standardGlBlendRealizations,
  standardGlTextureResolvers,
} from '@flighthq/render-gl/contract';
import type { GlRenderRegistries, Kind, NodeRenderer } from '@flighthq/types/contract';
import {
  BitmapTextKind,
  DisplayObjectKind,
  MorphShapeKind,
  ParticleEmitter2DKind,
  QuadBatchKind,
  RenderCacheKind,
  RichTextKind,
  Scale9SpriteKind,
  Scale9ShapeKind,
  ShapeKind,
  SpriteKind,
  StandardMaterialKind,
  TextLabelKind,
  TilemapKind,
} from '@flighthq/types/contract';

import { glBitmapTextRenderer } from './glBitmapText';
import { glRenderCacheRenderer } from './glCache';
import { glScene2DRenderer } from './glNode2D';
import { glParticleEmitter2DRenderer } from './glParticleEmitter2D';
import { glQuadBatchRenderer } from './glQuadBatch';
import { glRichTextRenderer } from './glRichText';
import { glScale9ShapeRenderer } from './glScale9Shape';
import { glScale9SpriteRenderer } from './glScale9Sprite';
import { glShapeRenderer, glMorphShapeRenderer } from './glShape';
import { glSpriteRenderer } from './glSprite';
import { standardGlQuadMaterialRenderer } from './glStandardMaterial';
import { glTextLabelRenderer } from './glTextLabel';
import { glTilemapRenderer } from './glTilemap';

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

export const glScene2DRenderPreset: Readonly<GlRenderRegistries> = Object.freeze({
  ...buildGlRenderRegistries({}),
  blendRealizations: standardGlBlendRealizations,
  materialRenderers: withKindMapEntry(new Map(), StandardMaterialKind, standardGlQuadMaterialRenderer),
  nodeRenderers: buildScene2DGlRenderers(),
  strokeTessellator: tessellateStrokePath,
  textureResolvers: standardGlTextureResolvers,
});
