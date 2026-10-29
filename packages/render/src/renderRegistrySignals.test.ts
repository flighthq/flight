import { connectSignal } from '@flighthq/signals/contract';
import type { Signal } from '@flighthq/signals/contract';
import type { Kind } from '@flighthq/types/contract';
import { RenderRegistryTable } from '@flighthq/types/contract';

import { enableRenderRegistrySignals } from './renderRegistrySignals.ts';
import { createRenderState, getRenderStateRuntime } from './renderState.ts';

describe('enableRenderRegistrySignals', () => {
  it('allocates one state-local registry-miss seam and reuses it', () => {
    const state = createRenderState();
    expect(getRenderStateRuntime(state).registryMiss).toBeNull();

    const signals = enableRenderRegistrySignals(state);

    expect(signals.onRegistryMiss).toBeDefined();
    expect(getRenderStateRuntime(state).registryMiss?.signals).toBe(signals);
    expect(enableRenderRegistrySignals(state)).toBe(signals);
  });

  it('delivers each miss as one registry and kind tuple', () => {
    const state = createRenderState();
    const signals = enableRenderRegistrySignals(state);
    expectTypeOf(signals.onRegistryMiss).toEqualTypeOf<Signal<readonly [RenderRegistryTable, Kind]>>();
    const misses: Array<readonly [RenderRegistryTable, Kind]> = [];
    connectSignal(signals.onRegistryMiss, (miss) => misses.push(miss));
    getRenderStateRuntime(state).registryMiss?.(RenderRegistryTable.TextureResolver, 'acme.Texture');
    expect(misses).toEqual([[RenderRegistryTable.TextureResolver, 'acme.Texture']]);
  });
});
