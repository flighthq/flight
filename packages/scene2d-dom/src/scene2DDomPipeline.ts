import { withKindMapEntry } from '@flighthq/registry/contract';
import type { DomRenderOptions, Kind, NodeRenderer } from '@flighthq/types/contract';
import {
  DisplayObjectKind,
  HtmlViewKind,
  MorphShapeKind,
  NativeTextKind,
  RenderCacheKind,
  RichTextKind,
  Scale9ShapeKind,
  Scale9SpriteKind,
  ShapeKind,
  SpriteKind,
  TextLabelKind,
} from '@flighthq/types/contract';

import { domRenderCacheRenderer } from './domCache.ts';
import { domHtmlViewRenderer } from './domHtmlView.ts';
import { domNativeTextRenderer } from './domNativeText.ts';
import { domScene2DRenderer } from './domNode2D.ts';
import { domRichTextRenderer } from './domRichText.ts';
import { domScale9ShapeRenderer } from './domScale9Shape.ts';
import { domScale9SpriteRenderer } from './domScale9Sprite.ts';
import { domMorphShapeRenderer, domShapeRenderer } from './domShape.ts';
import { domSpriteRenderer } from './domSprite.ts';
import { domTextLabelRenderer } from './domTextLabel.ts';

function buildScene2dDomRenderers(): ReadonlyMap<Kind, NodeRenderer> {
  let table: ReadonlyMap<Kind, NodeRenderer> = new Map();
  table = withKindMapEntry(table, DisplayObjectKind, domScene2DRenderer);
  table = withKindMapEntry(table, HtmlViewKind, domHtmlViewRenderer);
  table = withKindMapEntry(table, MorphShapeKind, domMorphShapeRenderer);
  table = withKindMapEntry(table, NativeTextKind, domNativeTextRenderer);
  table = withKindMapEntry(table, RenderCacheKind, domRenderCacheRenderer);
  table = withKindMapEntry(table, RichTextKind, domRichTextRenderer);
  table = withKindMapEntry(table, Scale9ShapeKind, domScale9ShapeRenderer);
  table = withKindMapEntry(table, Scale9SpriteKind, domScale9SpriteRenderer);
  table = withKindMapEntry(table, ShapeKind, domShapeRenderer);
  table = withKindMapEntry(table, SpriteKind, domSpriteRenderer);
  table = withKindMapEntry(table, TextLabelKind, domTextLabelRenderer);
  return table;
}

/**
 * Every node kind this backend draws, bound to the renderer that draws it — the DOM counterpart of
 * `canvasScene2DRenderPreset`, and spreadable straight into `createDomRenderState`.
 *
 * ★ WHY THIS EXISTS. DOM was the one 2D backend with no preset: its runtime seeds an EMPTY renderer
 * table and every caller wired the bindings by hand, so the only statement of which renderer serves
 * which kind lived in examples and tests. That makes the knowledge unreadable to anything else — a
 * build-time inventory could not ask DOM what it renders, and could not safely guess, because the
 * naming convention alone does not settle it (`DisplayObject` is served by `domScene2DRenderer`, a name
 * no rule would predict). Declaring it once here gives DOM the same single source of truth the other
 * three backends already had.
 *
 * `MorphShape` and `Shape` deliberately share one renderer: MorphShape owns a distinct kind while
 * rendering the same retained command vocabulary, and `domMorphShapeRenderer` is an alias of
 * `domShapeRenderer` rather than a second implementation — the same arrangement canvas, gl and wgpu use.
 *
 * DOM draws a narrower set than the GPU backends: it has no `BitmapText`, `ParticleEmitter2D`,
 * `QuadBatch` or `Tilemap` renderer, so those kinds are absent rather than bound to a stand-in that
 * would draw nothing.
 */
/**
 * Everything this backend needs that the CONTENT does not choose — the DOM counterpart of
 * `canvasRenderInfrastructure`, and deliberately EMPTY.
 *
 * DOM draws through elements rather than a drawing API, so it has no command table to stock and no
 * blend-mode application to install; its `shapeRasterizer` and `textureResolvers` are caller-supplied
 * and default to nothing. Declared anyway so a build-time manifest can compose the same way against
 * every backend instead of special-casing the one whose infrastructure happens to be empty.
 */
export const domRenderInfrastructure: Readonly<Omit<DomRenderOptions, 'nodeRenderers'>> = Object.freeze({});

export const domScene2DRenderPreset: Readonly<Pick<DomRenderOptions, 'nodeRenderers'>> = Object.freeze({
  ...domRenderInfrastructure,
  nodeRenderers: buildScene2dDomRenderers(),
});
