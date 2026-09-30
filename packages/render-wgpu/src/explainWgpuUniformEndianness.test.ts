import { describe, expect, it } from 'vitest';

import { explainWgpuUniformEndianness } from './explainWgpuUniformEndianness.ts';

describe('explainWgpuUniformEndianness', () => {
  it('reports the host endianness and validation status', () => {
    const result = explainWgpuUniformEndianness();
    expect(result.endianness).toBe('little');
    expect(result.status).toBe('validated');
  });
});
