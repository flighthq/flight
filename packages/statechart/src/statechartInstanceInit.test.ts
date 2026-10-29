import { allocateEntity } from '@flighthq/entity/contract';
import { describe, expect, it } from 'vitest';

import { initializeStatechartInstance } from './statechartInstanceInit.ts';
import { StatechartAtomicStateKind } from './types.ts';
import type { StatechartInstanceRaw, StatechartRaw } from './types.ts';

describe('initializeStatechartInstance', () => {
  it('initializes caller-allocated state and nullable slots', () => {
    const chart: StatechartRaw = {
      inputs: [],
      regions: [{ initialStateIndex: 0, states: [{ kind: StatechartAtomicStateKind, transitions: [] }] }],
    };
    const out = allocateEntity<StatechartInstanceRaw>();
    initializeStatechartInstance(out, chart);
    expect(out.chart).toBe(chart);
    expect(out.durationGuard).toBeNull();
    expect(out.signals).toBeNull();
  });
});
