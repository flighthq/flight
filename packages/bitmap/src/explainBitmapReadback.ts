import type { BitmapReadbackExplanation, HostBitmapReadbackProvider } from '@flighthq/types/contract';

import { resolveBitmapReadback } from './bitmapReadbackResolver';

export function explainBitmapReadback(
  hostBitmapReadback: Readonly<HostBitmapReadbackProvider>,
  source: CanvasImageSource,
  width: number,
  height: number,
): BitmapReadbackExplanation {
  const outcome = resolveBitmapReadback(hostBitmapReadback, source, width, height, 'probe');
  return { readable: outcome.reason === 'ok', reason: outcome.reason };
}
