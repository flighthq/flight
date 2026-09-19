import { tessellateStrokePath } from '@flighthq/path/contract';
import { createSlotTable, withRegistryTableEntry } from '@flighthq/registry/contract';
import {
  allocateEmptyGlRenderRegistries,
  standardGlBlendRealizations,
  standardGlTextureResolvers,
} from '@flighthq/render-gl/contract';
import type { GlRenderRegistries, KeyedTable, Renderer } from '@flighthq/types/contract';
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

import { defaultGlBitmapTextRenderer } from './glBitmapText';
import { defaultGlRenderCacheRenderer } from './glCache';
import { defaultGlScene2DRenderer } from './glNode2D';
import { defaultGlParticleEmitter2DRenderer } from './glParticleEmitter2D';
import { defaultGlQuadBatchRenderer } from './glQuadBatch';
import { defaultGlRichTextRenderer } from './glRichText';
import { defaultGlScale9ShapeRenderer } from './glScale9Shape';
import { defaultGlScale9SpriteRenderer } from './glScale9Sprite';
import { defaultGlShapeRenderer, defaultGlMorphShapeRenderer } from './glShape';
import { defaultGlSpriteRenderer } from './glSprite';
import { standardGlMaterialRenderer } from './glStandardMaterial';
import { defaultGlTextLabelRenderer } from './glTextLabel';
import { defaultGlTilemapRenderer } from './glTilemap';

function buildScene2DGlRenderers(): KeyedTable<Renderer> {
  const registries = allocateEmptyGlRenderRegistries();
  let table = registries.renderers;
  table = withRegistryTableEntry(table, BitmapTextKind, defaultGlBitmapTextRenderer);
  table = withRegistryTableEntry(table, DisplayObjectKind, defaultGlScene2DRenderer);
  table = withRegistryTableEntry(table, MorphShapeKind, defaultGlMorphShapeRenderer);
  table = withRegistryTableEntry(table, ParticleEmitter2DKind, defaultGlParticleEmitter2DRenderer);
  table = withRegistryTableEntry(table, QuadBatchKind, defaultGlQuadBatchRenderer);
  table = withRegistryTableEntry(table, RenderCacheKind, defaultGlRenderCacheRenderer);
  table = withRegistryTableEntry(table, RichTextKind, defaultGlRichTextRenderer);
  table = withRegistryTableEntry(table, Scale9SpriteKind, defaultGlScale9SpriteRenderer);
  table = withRegistryTableEntry(table, Scale9ShapeKind, defaultGlScale9ShapeRenderer);
  table = withRegistryTableEntry(table, ShapeKind, defaultGlShapeRenderer);
  table = withRegistryTableEntry(table, SpriteKind, defaultGlSpriteRenderer);
  table = withRegistryTableEntry(table, TextLabelKind, defaultGlTextLabelRenderer);
  table = withRegistryTableEntry(table, TilemapKind, defaultGlTilemapRenderer);
  return table;
}

export const defaultScene2DGlRenderRegistries: Readonly<GlRenderRegistries> = {
  ...allocateEmptyGlRenderRegistries(),
  blendRealizations: standardGlBlendRealizations,
  materialRenderers: withRegistryTableEntry(
    allocateEmptyGlRenderRegistries().materialRenderers,
    StandardMaterialKind,
    standardGlMaterialRenderer,
  ),
  renderers: buildScene2DGlRenderers(),
  strokeTessellator: {
    ...createSlotTable('StrokeTessellator', 'Rasterize'),
    entry: { state: RegistryEntryState.Bound, value: tessellateStrokePath },
  },
  textureResolvers: standardGlTextureResolvers,
};
