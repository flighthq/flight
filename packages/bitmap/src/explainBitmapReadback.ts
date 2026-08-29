import type { BitmapReadbackExplanation } from '@flighthq/types/contract';

import { resolveBitmapReadback } from './bitmapReadbackResolver';

// Authoritative over the EXPECTED-FAILURE vocabulary for createBitmapFromImageSource: it invokes the
// same resolver in one-pixel probe mode and allocates no Bitmap. It does not predict FAULTS; in
// particular, a successful probe does not promise that the constructor's full read or allocation
// cannot fault, and those faults propagate from the constructor.
export function explainBitmapReadback(
  source: CanvasImageSource,
  width: number,
  height: number,
): BitmapReadbackExplanation {
  const outcome = resolveBitmapReadback(source, width, height, 'probe');
  return { readable: outcome.reason === 'ok', reason: outcome.reason };
}
