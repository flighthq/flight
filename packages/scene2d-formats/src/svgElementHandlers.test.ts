import { SvgElementKind as Kind } from '@flighthq/types/contract';
import { describe, expect, it } from 'vitest';

import { svgContainerElementHandler } from './svgContainerElement.ts';
import { svgAllElementHandlers, registerSvgElementHandlers } from './svgElementHandlers.ts';
import { svgGeometryElementHandler } from './svgGeometryElement.ts';
import { svgImageElementHandler } from './svgImageElement.ts';
import { createSvgRegistry } from './svgRegistry.ts';
import { svgTextElementHandler } from './svgTextElement.ts';
import { svgUseElementHandler } from './svgUseElement.ts';

// Each handler's own test asserts that the preset installs it for its kind. What is left here is what only the family
// can answer: that the family is exactly these five, and that installing it covers every kind the dispatch can produce.
describe('registerSvgElementHandlers', () => {
  it('registers exactly one handler for every element kind', () => {
    const registry = createSvgRegistry();
    registerSvgElementHandlers(registry);
    expect(registry.elementHandlers.map((entry) => entry.kind).sort()).toEqual(Object.values(Kind).sort());
  });
});

describe('svgAllElementHandlers', () => {
  it('contains every built-in element handler', () => {
    expect(svgAllElementHandlers).toContain(svgContainerElementHandler);
    expect(svgAllElementHandlers).toContain(svgGeometryElementHandler);
    expect(svgAllElementHandlers).toContain(svgImageElementHandler);
    expect(svgAllElementHandlers).toContain(svgTextElementHandler);
    expect(svgAllElementHandlers).toContain(svgUseElementHandler);
    expect(svgAllElementHandlers).toHaveLength(5);
  });
});
