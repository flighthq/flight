import type { RectangleLike, Scale9Mapper } from '@flighthq/types';

export function buildDOMScale9Mapper(
  bounds: Readonly<RectangleLike>,
  scale9Grid: Readonly<RectangleLike>,
  scaleX: number,
  scaleY: number,
): Scale9Mapper | null {
  if (scaleX <= 0 || scaleY <= 0 || bounds.width <= 0 || bounds.height <= 0) return null;

  const gx = scale9Grid.x;
  const gy = scale9Grid.y;
  const gw = scale9Grid.width;
  const gh = scale9Grid.height;
  const bw = bounds.width;
  const bh = bounds.height;

  return {
    mapX: (x: number) => toScale9Position(x, gx, gw, bw, scaleX),
    mapY: (y: number) => toScale9Position(y, gy, gh, bh, scaleY),
  };
}

function toScale9Position(
  pos: number,
  scale9Start: number,
  scale9Center: number,
  unscaledSize: number,
  scale: number,
): number {
  const scale9End = unscaledSize - scale9Center - scale9Start;
  const size = unscaledSize * scale;
  const center = size - scale9Start - scale9End;

  if (pos <= scale9Start) {
    if (center < 0) {
      return (pos * (scale9Start + scale9End + center)) / (scale9Start + scale9End);
    }
    return pos;
  }

  if (pos >= scale9Start + scale9Center) {
    if (center < 0) {
      return (
        ((scale9Start + (pos - scale9Start - scale9Center)) * (scale9Start + scale9End + center)) /
        (scale9Start + scale9End)
      );
    }
    return scale9Start + center + (pos - scale9Start - scale9Center);
  }

  if (center < 0) {
    return (scale9Start * (scale9Start + scale9End + center)) / (scale9Start + scale9End);
  }
  return scale9Start + (center * (pos - scale9Start)) / scale9Center;
}
