import { createSpriteRendererData, isSpriteRendererDirty } from '@flighthq/scene2d/contract';
import { getTextureHeight, getTextureWidth } from '@flighthq/texture/contract';
import type {
  CanvasRenderState,
  MatrixLike,
  RenderProxy2D,
  Scale9Sprite,
  Scene2DRenderer,
} from '@flighthq/types/contract';

import { drawCanvasScene2D } from './canvasNode2D';
import { getCanvasRenderStateTextureResolvers } from './canvasRenderState';
import { CANVAS_SCALE9_SPRITE_SLICE_STRIDE, writeCanvasScale9SpriteSlices } from './canvasScale9SpriteSlices';
import { resolveCanvasTexture } from './canvasTextureResolver';
import { setCanvasTransform } from './canvasTransform';

// Draws a textured node in nine pieces so its border keeps its authored thickness at any size. This is
// the sprite counterpart of drawCanvasScale9Shape and follows the same two rules: the node's own
// scaleX/scaleY are stripped off the canvas transform so the slices can be laid out at the node's scaled
// size in unscaled space, and a grid that cannot be applied falls back to drawing the texture whole
// rather than drawing nothing.
//
// The grid divides the NODE TEXTURE, not the node's children — a Scale9Sprite composes like any other
// node, and only its own texture is sliced.
export function drawCanvasScale9Sprite(state: CanvasRenderState, renderProxy: RenderProxy2D): void {
  drawCanvasScene2D(state, renderProxy);

  const source = renderProxy.source as Scale9Sprite;
  const texture = source.data.texture;
  if (texture === null || texture.dimension !== '2d') return;
  const drawable = resolveCanvasTexture(getCanvasRenderStateTextureResolvers(state), texture);
  if (drawable === null) return;

  const textureWidth = getTextureWidth(texture);
  const textureHeight = getTextureHeight(texture);
  const sourceX = texture.uvOffset.x * textureWidth;
  const sourceY = texture.uvOffset.y * textureHeight;
  const sourceWidth = Math.abs(texture.uvScale.x * textureWidth);
  const sourceHeight = Math.abs(texture.uvScale.y * textureHeight);
  if (sourceWidth <= 0 || sourceHeight <= 0) return;

  const context = state.context;
  state.applyBlendMode?.(state, renderProxy.blendMode);
  context.globalAlpha = renderProxy.alpha;

  const smoothing = state.allowSmoothing && !texture.sampler.magFilter.startsWith('nearest');
  if (!smoothing) context.imageSmoothingEnabled = false;

  const { scaleX, scaleY } = source;
  const sliceCount = writeCanvasScale9SpriteSlices(
    _slices,
    sourceWidth,
    sourceHeight,
    source.data.scale9Grid,
    sourceWidth * scaleX,
    sourceHeight * scaleY,
  );

  if (sliceCount === 0) {
    setCanvasTransform(state, context, renderProxy.transform2D);
    context.drawImage(drawable, sourceX, sourceY, sourceWidth, sourceHeight, 0, 0, sourceWidth, sourceHeight);
  } else {
    applyStrippedTransform(state, context, renderProxy.transform2D, scaleX, scaleY);
    for (let slice = 0; slice < sliceCount; slice++) {
      const at = slice * CANVAS_SCALE9_SPRITE_SLICE_STRIDE;
      context.drawImage(
        drawable,
        sourceX + _slices[at],
        sourceY + _slices[at + 1],
        _slices[at + 2],
        _slices[at + 3],
        _slices[at + 4],
        _slices[at + 5],
        _slices[at + 6],
        _slices[at + 7],
      );
    }
  }

  if (!smoothing) context.imageSmoothingEnabled = true;
}

// Scale9Sprite extends Sprite and reuses the sprite runtime, so it reuses the sprite renderer data and
// its texture-version dirty test. That is a dependency on the scene2d sprite CONTRACT, not on the canvas
// sprite renderer: nothing here reaches into drawCanvasSprite, and registering this kind leaves
// SpriteKind resolving to its own renderer untouched.
export const defaultCanvasScale9SpriteRenderer: Scene2DRenderer = {
  createData: createSpriteRendererData,
  isDirty: isSpriteRendererDirty,
  submit: drawCanvasScale9Sprite,
};

const _slices: number[] = [];

// Removes the node's own scale from the transform so the nine slices, which are already laid out at the
// node's scaled size, are not scaled a second time. Identical to the Scale9Shape path — the two must
// agree, because a shape and a sprite under the same parent have to land on the same pixels.
function applyStrippedTransform(
  state: CanvasRenderState,
  context: CanvasRenderingContext2D,
  t: Readonly<MatrixLike>,
  scaleX: number,
  scaleY: number,
): void {
  const a = scaleX !== 0 ? t.a / scaleX : t.a;
  const b = scaleX !== 0 ? t.b / scaleX : t.b;
  const c = scaleY !== 0 ? t.c / scaleY : t.c;
  const d = scaleY !== 0 ? t.d / scaleY : t.d;
  if (state.roundPixels) {
    context.setTransform(a, b, c, d, Math.fround(t.tx), Math.fround(t.ty));
  } else {
    context.setTransform(a, b, c, d, t.tx, t.ty);
  }
}
