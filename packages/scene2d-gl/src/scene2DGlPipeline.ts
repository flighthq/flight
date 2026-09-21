import { tessellateStrokePath } from '@flighthq/path/contract';
import { createSlotTable, withRegistryTableEntry } from '@flighthq/registry/contract';
import {
  allocateEmptyGlRenderRegistries,
  standardGlBlendRealizations,
  standardGlTextureResolvers,
} from '@flighthq/render-gl/contract';
import type { GlRenderRegistries, KeyedTable, NodeRenderer } from '@flighthq/types/contract';
import {
  BitmapTextKind,
  DisplayObjectKind,
  MorphShapeKind,
  ParticleEmitter2DKind,
  QuadBatchKind,
  RenderCacheKind,
  RegistryEntryState,
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

function buildScene2DGlRenderers(): KeyedTable<NodeRenderer> {
  const registries = allocateEmptyGlRenderRegistries();
  let table = registries.nodeRenderers;
  table = withRegistryTableEntry(table, BitmapTextKind, glBitmapTextRenderer);
  table = withRegistryTableEntry(table, DisplayObjectKind, glScene2DRenderer);
  table = withRegistryTableEntry(table, MorphShapeKind, glMorphShapeRenderer);
  table = withRegistryTableEntry(table, ParticleEmitter2DKind, glParticleEmitter2DRenderer);
  table = withRegistryTableEntry(table, QuadBatchKind, glQuadBatchRenderer);
  table = withRegistryTableEntry(table, RenderCacheKind, glRenderCacheRenderer);
  table = withRegistryTableEntry(table, RichTextKind, glRichTextRenderer);
  table = withRegistryTableEntry(table, Scale9SpriteKind, glScale9SpriteRenderer);
  table = withRegistryTableEntry(table, Scale9ShapeKind, glScale9ShapeRenderer);
  table = withRegistryTableEntry(table, ShapeKind, glShapeRenderer);
  table = withRegistryTableEntry(table, SpriteKind, glSpriteRenderer);
  table = withRegistryTableEntry(table, TextLabelKind, glTextLabelRenderer);
  table = withRegistryTableEntry(table, TilemapKind, glTilemapRenderer);
  return table;
}

export const glScene2DRenderRegistries: Readonly<GlRenderRegistries> = {
  ...allocateEmptyGlRenderRegistries(),
  blendRealizations: standardGlBlendRealizations,
  materialRenderers: withRegistryTableEntry(
    allocateEmptyGlRenderRegistries().materialRenderers,
    StandardMaterialKind,
    standardGlQuadMaterialRenderer,
  ),
  nodeRenderers: buildScene2DGlRenderers(),
  strokeTessellator: {
    ...createSlotTable('StrokeTessellator', 'Rasterize'),
    entry: { state: RegistryEntryState.Bound, value: tessellateStrokePath },
  },
  textureResolvers: standardGlTextureResolvers,
};
