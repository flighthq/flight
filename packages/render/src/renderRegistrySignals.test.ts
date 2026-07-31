import { enableRenderRegistrySignals } from './renderRegistrySignals';
import { createRenderState, getRenderStateRuntime } from './renderState';

describe('enableRenderRegistrySignals', () => {
  it('allocates one state-local registry-miss seam and reuses it', () => {
    const state = createRenderState();
    expect(getRenderStateRuntime(state).registryMiss).toBeNull();

    const signals = enableRenderRegistrySignals(state);

    expect(signals.onRegistryMiss).toBeDefined();
    expect(getRenderStateRuntime(state).registryMiss?.signals).toBe(signals);
    expect(enableRenderRegistrySignals(state)).toBe(signals);
  });
});
