import type { TextureAtlasRegion } from '@flighthq/types/contract';

// Draws one packed atlas rectangle upright in the current local coordinate system. TexturePacker and
// Starling store a rotated frame clockwise, while libGDX stores it counterclockwise. The matching
// inverse quarter-turn maps either convention to the logical destination directly, without
// materializing an unrotated canvas.
export function drawCanvasAtlasRegion(
  context: CanvasRenderingContext2D,
  source: CanvasImageSource,
  region: Readonly<TextureAtlasRegion>,
  x: number,
  y: number,
  width: number,
  height: number,
): void {
  if (!region.rotated) {
    context.drawImage(source, region.x, region.y, region.width, region.height, x, y, width, height);
    return;
  }

  const scaleX = width / region.height;
  const scaleY = height / region.width;
  context.save();
  if (region.rotationDirection === 'counterclockwise') {
    context.transform(0, scaleY, -scaleX, 0, x + scaleX * (region.y + region.height), y - scaleY * region.x);
  } else {
    context.transform(0, -scaleY, scaleX, 0, x - scaleX * region.y, y + scaleY * (region.x + region.width));
  }
  context.drawImage(
    source,
    region.x,
    region.y,
    region.width,
    region.height,
    region.x,
    region.y,
    region.width,
    region.height,
  );
  context.restore();
}
