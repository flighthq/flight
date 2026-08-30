import { createEntity } from '@flighthq/entity/contract';
import { describe, expect, it, vi } from 'vitest';

import * as midi from './contract';

describe('getMidiPermission', () => {
  it('queries only the explicit MIDI permission owner and preserves shared query outcomes', async () => {
    const getPermission = vi
      .fn()
      .mockResolvedValueOnce({ reason: 'ok', state: 'prompt' })
      .mockResolvedValueOnce({ reason: 'unsupported' })
      .mockRejectedValueOnce(new Error('provider fault'));
    const host = { midi: { permission: createEntity({ getPermission }) } };
    const getMidiPermission = requiredFunction('getMidiPermission');
    await expect(getMidiPermission(host)).resolves.toEqual({ reason: 'ok', state: 'prompt' });
    await expect(getMidiPermission(host)).resolves.toEqual({ reason: 'unsupported' });
    await expect(getMidiPermission(host)).resolves.toEqual({ reason: 'operation-failed' });
    expect(getPermission).toHaveBeenCalledTimes(3);
  });
});

function requiredFunction(name: string): (...args: unknown[]) => unknown {
  const value: unknown = Reflect.get(midi, name);
  expect(value, `${name} export`).toBeTypeOf('function');
  if (typeof value !== 'function') throw new TypeError(`${name} is not exported`);
  return value as (...args: unknown[]) => unknown;
}
