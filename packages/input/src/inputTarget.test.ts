import { hasEntityRuntime } from '@flighthq/entity/contract';
import { describe, expect, it } from 'vitest';

import { createInputTargetHandle, initializeInputTargetHandle } from './contract.ts';

describe('createInputTargetHandle', () => {
  it('allocates a fresh handle', () => {
    const handle = createInputTargetHandle();
    expect(!hasEntityRuntime(handle!)).toBe(true);
  });
});

describe('initializeInputTargetHandle', () => {
  it('accepts an existing handle', () => {
    const handle = createInputTargetHandle();
    let locked = handle!;
    initializeInputTargetHandle(locked);
    expect(!hasEntityRuntime(locked)).toBe(true);
  });
});
