import { createMatrix3 } from '@flighthq/geometry/contract';
import { getTextureHeight, getTextureUvMatrix, getTextureWidth } from '@flighthq/texture/contract';
import type { Texture2D } from '@flighthq/types/contract';

// Draws a Texture view into the current local coordinate system. The caller owns the local-to-target
// transform and smoothing state. Ordinary positive, unrotated windows retain the single drawImage
// crop fast path. Cardinal rotations (including packed-atlas quarter turns) use one affine transform
// plus one cropped drawImage, with no temporary surface or clip. Only a genuinely oblique UV transform
// needs a clip around a whole-source affine draw.
export function drawCanvasTextureView(
  context: CanvasRenderingContext2D,
  source: CanvasImageSource,
  texture: Readonly<Texture2D>,
  viewWidth: number,
  viewHeight: number,
): void {
  const backingWidth = getTextureWidth(texture);
  const backingHeight = getTextureHeight(texture);
  if (backingWidth <= 0 || backingHeight <= 0 || viewWidth <= 0 || viewHeight <= 0) return;

  if (texture.uvRotation === 0 && !texture.flipX && !texture.flipY && texture.uvScale.x > 0 && texture.uvScale.y > 0) {
    context.drawImage(
      source,
      texture.uvOffset.x * backingWidth,
      texture.uvOffset.y * backingHeight,
      texture.uvScale.x * backingWidth,
      texture.uvScale.y * backingHeight,
      0,
      0,
      viewWidth,
      viewHeight,
    );
    return;
  }

  getTextureUvMatrix(textureUvMatrix, texture);
  const m = textureUvMatrix.m;
  const a = (backingWidth * m[0]) / viewWidth;
  const b = (backingHeight * m[1]) / viewWidth;
  const c = (backingWidth * m[3]) / viewHeight;
  const d = (backingHeight * m[4]) / viewHeight;
  const sourceOriginX = backingWidth * m[6];
  const sourceOriginY = backingHeight * m[7];
  const determinant = a * d - b * c;
  if (!Number.isFinite(determinant) || Math.abs(determinant) <= Number.EPSILON) return;

  // Invert the local-pixel -> source-pixel transform. Canvas transforms destinations, so applying
  // this inverse makes each source texel land at the local point whose UV selects it.
  const inverseA = d / determinant;
  const inverseB = -b / determinant;
  const inverseC = -c / determinant;
  const inverseD = a / determinant;
  const inverseTx = (c * sourceOriginY - d * sourceOriginX) / determinant;
  const inverseTy = (b * sourceOriginX - a * sourceOriginY) / determinant;

  if (isCardinalUvTransform(a, b, c, d)) {
    const x1 = sourceOriginX + a * viewWidth;
    const y1 = sourceOriginY + b * viewWidth;
    const x2 = sourceOriginX + c * viewHeight;
    const y2 = sourceOriginY + d * viewHeight;
    const x3 = x1 + c * viewHeight;
    const y3 = y1 + d * viewHeight;
    const sourceX = Math.min(sourceOriginX, x1, x2, x3);
    const sourceY = Math.min(sourceOriginY, y1, y2, y3);
    const sourceWidth = Math.max(sourceOriginX, x1, x2, x3) - sourceX;
    const sourceHeight = Math.max(sourceOriginY, y1, y2, y3) - sourceY;
    context.transform(inverseA, inverseB, inverseC, inverseD, inverseTx, inverseTy);
    context.drawImage(source, sourceX, sourceY, sourceWidth, sourceHeight, sourceX, sourceY, sourceWidth, sourceHeight);
    return;
  }

  context.save();
  context.beginPath();
  context.rect(0, 0, viewWidth, viewHeight);
  context.clip();
  context.transform(inverseA, inverseB, inverseC, inverseD, inverseTx, inverseTy);
  context.drawImage(source, 0, 0, backingWidth, backingHeight, 0, 0, backingWidth, backingHeight);
  context.restore();
}

function isCardinalUvTransform(a: number, b: number, c: number, d: number): boolean {
  return (
    (Math.abs(b) <= CARDINAL_EPSILON && Math.abs(c) <= CARDINAL_EPSILON) ||
    (Math.abs(a) <= CARDINAL_EPSILON && Math.abs(d) <= CARDINAL_EPSILON)
  );
}

const CARDINAL_EPSILON = 1e-12;
const textureUvMatrix = createMatrix3();
