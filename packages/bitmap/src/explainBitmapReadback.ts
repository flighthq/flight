import { resolveBitmapReadback } from './bitmapReadbackResolver.ts';
import type { BitmapReadbackExplanation, HostBitmapReadbackCapability } from './types.ts';

export function explainBitmapReadback(
  hostBitmapReadback: Readonly<HostBitmapReadbackCapability>,
  source: CanvasImageSource,
  width: number,
  height: number,
): BitmapReadbackExplanation {
  const outcome = resolveBitmapReadback(hostBitmapReadback, source, width, height, 'probe');
  return { readable: outcome.reason === 'ok', reason: outcome.reason };
}
