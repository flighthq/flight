import { withRegistryTableEntry } from '@flighthq/registry/contract';
import { createEmptyGlRegistries, createGlPipeline, standardGlTextureResolvers } from '@flighthq/render-gl/contract';
import type { GlPipeline, KeyedTable, Renderer } from '@flighthq/types/contract';
import {
  BitmapTextKind,
  DisplayObjectKind,
  MorphShapeKind,
  ParticleEmitter2DKind,
  QuadBatchKind,
  RenderCacheKind,
  RichTextKind,
  Scale9ShapeKind,
  ShapeKind,
  SpriteKind,
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
import { defaultGlShapeRenderer, defaultGlMorphShapeRenderer } from './glShape';
import { defaultGlSpriteRenderer } from './glSprite';
import { defaultGlTextLabelRenderer } from './glTextLabel';
import { defaultGlTilemapRenderer } from './glTilemap';

function buildScene2dGlRenderers(): KeyedTable<Renderer> {
  const registries = createEmptyGlRegistries();
  let table = registries.renderers;
  table = withRegistryTableEntry(table, BitmapTextKind, defaultGlBitmapTextRenderer);
  table = withRegistryTableEntry(table, DisplayObjectKind, defaultGlScene2DRenderer);
  table = withRegistryTableEntry(table, MorphShapeKind, defaultGlMorphShapeRenderer);
  table = withRegistryTableEntry(table, ParticleEmitter2DKind, defaultGlParticleEmitter2DRenderer);
  table = withRegistryTableEntry(table, QuadBatchKind, defaultGlQuadBatchRenderer);
  table = withRegistryTableEntry(table, RenderCacheKind, defaultGlRenderCacheRenderer);
  table = withRegistryTableEntry(table, RichTextKind, defaultGlRichTextRenderer);
  table = withRegistryTableEntry(table, Scale9ShapeKind, defaultGlScale9ShapeRenderer);
  table = withRegistryTableEntry(table, ShapeKind, defaultGlShapeRenderer);
  table = withRegistryTableEntry(table, SpriteKind, defaultGlSpriteRenderer);
  table = withRegistryTableEntry(table, TextLabelKind, defaultGlTextLabelRenderer);
  table = withRegistryTableEntry(table, TilemapKind, defaultGlTilemapRenderer);
  return table;
}

export const scene2dGlPipeline: GlPipeline = createGlPipeline({
  ...createEmptyGlRegistries(),
  renderers: buildScene2dGlRenderers(),
  textureResolvers: standardGlTextureResolvers,
});
