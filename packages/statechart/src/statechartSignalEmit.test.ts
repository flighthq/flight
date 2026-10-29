import { connectSignal } from '@flighthq/signals/contract';
import { describe, expect, it, vi } from 'vitest';

import { createStatechartInstance } from './statechart.ts';
import { emitStatechartStateChange } from './statechartSignalEmit.ts';
import { enableStatechartSignals } from './statechartSignals.ts';

describe('emitStatechartStateChange', () => {
  it('forwards the three positional state-change arguments', () => {
    const instance = createStatechartInstance({ inputs: [], regions: [] });
    const signals = enableStatechartSignals(instance);
    const listener = vi.fn();
    connectSignal(signals.onStateChange, listener);

    emitStatechartStateChange(signals, 2, 3, 4);

    expect(listener).toHaveBeenCalledWith(2, 3, 4);
  });
});
