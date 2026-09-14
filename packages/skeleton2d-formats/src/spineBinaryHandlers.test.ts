import { describe, expect, it } from 'vitest';

import { registerAllSpineBinaryHandlers } from './spineBinaryHandlers';
import { createSpineBinaryRegistry } from './spineBinaryRegistry';

describe('registerAllSpineBinaryHandlers', () => {
  it('registers both handler families', () => {
    const registry = createSpineBinaryRegistry();
    registerAllSpineBinaryHandlers(registry);
    expect(registry.sectionHandlers).toHaveLength(8);
    expect(registry.timelineHandlers).toHaveLength(8);
  });
});
