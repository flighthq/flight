import { logOnce } from '@flighthq/log/contract';
import type { MaterialConversionExplanation } from '@flighthq/types/contract';
import { LogLevel } from '@flighthq/types/contract';

import { setMaterialConversionGuard } from './pbrMaterials';

// Uninstalls the guard, restoring the silent conversion.
export function disableMaterialConversionGuards(): void {
  setMaterialConversionGuard(null);
}

// Installs the caller-facing guard for material conversions that discard a map they cannot carry. A
// converter writes an `out` and returns nothing, so a dropped map produces a materially different
// surface — flat where the source was textured — with no signal at all. This warns instead, naming both
// the conversion and the remedy.
//
// Not calling this — the production default — costs the conversion nothing: the messages and the
// `@flighthq/log` dependency live only in this separately-imported module. Idempotent.
export function enableMaterialConversionGuards(): void {
  setMaterialConversionGuard(warnMaterialConversionDrop);
}

function warnMaterialConversionDrop(explanation: Readonly<MaterialConversionExplanation>, conversion: string): void {
  const maps = explanation.droppedMaps.join(', ');
  // Keyed by conversion so two different converters each get heard once, rather than the first one
  // silencing the second for the rest of the process.
  logOnce(
    `materials:conversion-dropped-map:${conversion}`,
    LogLevel.Warn,
    {
      message:
        explanation.reason === 'incompatible-channel-semantics'
          ? `${conversion} discarded ${maps}: its channels pack different quantities than the target slot, so no assignment preserves meaning. Bake the texture into the target's own layout and pass it explicitly.`
          : `${conversion} discarded ${maps}: the target material model has no slot for that quantity. Supply the nearest target map explicitly if the surface needs it.`,
    },
    'materials',
  );
}
