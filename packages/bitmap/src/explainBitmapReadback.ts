import type { BitmapReadbackExplanation, HasGraphicsBitmapReadback } from '@flighthq/types/contract';

import { resolveBitmapReadback } from './bitmapReadbackResolver';

export function explainBitmapReadback(
  host: Readonly<HasGraphicsBitmapReadback>,
  source: CanvasImageSource,
  width: number,
  height: number,
): BitmapReadbackExplanation {
  const outcome = resolveBitmapReadback(host, source, width, height, 'probe');
  return { readable: outcome.reason === 'ok', reason: outcome.reason };
}
