import { logOnce } from '@flighthq/log/contract';
import type { TiledCompression, TiledLayerDataFailure } from '@flighthq/types/contract';
import { LogLevel } from '@flighthq/types/contract';

import { setTiledLayerDataGuard } from './tiledLayerData';

// Uninstalls the guard, restoring the silent parse.
export function disableTilemapFormatsGuards(): void {
  setTiledLayerDataGuard(null);
}

// Installs the caller-facing parse guard: a compressed tile layer the codec cannot decode is preserved
// as an all-zero grid rather than dropped, which keeps the document faithful but makes an empty-looking
// map indistinguishable from a correctly parsed empty one. This warns instead, and distinguishes the two
// causes, because they call for opposite fixes — a missing seam is the caller's wiring, a failing seam is
// the payload.
//
// Not calling this — the production default — costs the parse nothing: the messages and the
// `@flighthq/log` dependency live only in this separately-imported module. Idempotent.
export function enableTilemapFormatsGuards(): void {
  setTiledLayerDataGuard(warnTiledLayerDataFailure);
}

function warnTiledLayerDataFailure(reason: TiledLayerDataFailure, compression: TiledCompression): void {
  if (reason === 'compressed-without-inflate') {
    logOnce(
      'tilemap-formats:layer-compressed-without-inflate',
      LogLevel.Warn,
      {
        message: `A tile layer is ${compression}-compressed but no inflate seam was supplied, so it was preserved as an all-zero grid. Pass options.inflate to parseTiledTmx/parseTiledTmj to decode it.`,
      },
      'tilemap-formats',
    );
    return;
  }
  logOnce(
    'tilemap-formats:layer-inflate-failed',
    LogLevel.Warn,
    {
      message: `The supplied inflate seam returned null for a ${compression}-compressed tile layer, so it was preserved as an all-zero grid. The payload or the seam's ${compression} support is the fault, not the parse.`,
    },
    'tilemap-formats',
  );
}
