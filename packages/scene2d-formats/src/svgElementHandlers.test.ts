import type { SvgElementHandler, SvgElementKind } from '@flighthq/types/contract';
import { SvgElementKind as Kind } from '@flighthq/types/contract';
import { describe, expect, it } from 'vitest';

import {
  svgAllElementHandlers,
  svgContainerElementHandler,
  svgGeometryElementHandler,
  svgImageElementHandler,
  svgTextElementHandler,
  svgUseElementHandler,
  registerSvgElementHandlers,
} from './svgElementHandlers.ts';
import { createSvgRegistry, getSvgElementHandler } from './svgRegistry.ts';

function expectRegisteredElement(kind: SvgElementKind, handler: SvgElementHandler): void {
  const registry = createSvgRegistry();
  registerSvgElementHandlers(registry);
  expect(getSvgElementHandler(registry, kind)).toBe(handler);
}

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

describe('svgContainerElementHandler', () => {
  it('is the built-in Container element handler', () => {
    expectRegisteredElement(Kind.Container, svgContainerElementHandler);
  });
});

describe('svgGeometryElementHandler', () => {
  it('is the built-in Geometry element handler', () => {
    expectRegisteredElement(Kind.Geometry, svgGeometryElementHandler);
  });
});

describe('svgImageElementHandler', () => {
  it('is the built-in Image element handler', () => {
    expectRegisteredElement(Kind.Image, svgImageElementHandler);
  });
});

describe('svgTextElementHandler', () => {
  it('is the built-in Text element handler', () => {
    expectRegisteredElement(Kind.Text, svgTextElementHandler);
  });
});

describe('svgUseElementHandler', () => {
  it('is the built-in Use element handler', () => {
    expectRegisteredElement(Kind.Use, svgUseElementHandler);
  });
});
