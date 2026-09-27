import { describe, expect, it } from 'vitest';

import { registerSvgElementHandlers } from './svgElementHandlers.ts';
import { registerAllSvgHandlers } from './svgHandlers.ts';
import { createSvgRegistry } from './svgRegistry.ts';

describe('registerAllSvgHandlers', () => {
  it('registers the element handler family', () => {
    const registry = createSvgRegistry();
    registerAllSvgHandlers(registry);
    const elements = createSvgRegistry();
    registerSvgElementHandlers(elements);
    expect(registry.elementHandlers).toEqual(elements.elementHandlers);
  });
});
