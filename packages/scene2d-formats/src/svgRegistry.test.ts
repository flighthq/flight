import type { SvgElementHandler } from '@flighthq/types/contract';
import { SvgElementKind } from '@flighthq/types/contract';

import {
  createSvgRegistry,
  getSvgElementHandler,
  registerSvgElementHandler,
  unregisterSvgElementHandler,
} from './svgRegistry.ts';

describe('createSvgRegistry', () => {
  it('creates independent empty registries', () => {
    const first = createSvgRegistry();
    const second = createSvgRegistry();
    expect(first.elementHandlers).toEqual([]);
    registerSvgElementHandler(first, SvgElementKind.Container, () => null);
    expect(first.elementHandlers).toHaveLength(1);
    expect(second.elementHandlers).toEqual([]);
  });
});

describe('getSvgElementHandler', () => {
  it('returns null for an unregistered element kind', () => {
    expect(getSvgElementHandler(createSvgRegistry(), SvgElementKind.Container)).toBeNull();
  });
});

describe('registerSvgElementHandler', () => {
  it('is last-write-wins without moving the registered key', () => {
    const registry = createSvgRegistry();
    const first: SvgElementHandler = () => null;
    const second: SvgElementHandler = () => null;
    registerSvgElementHandler(registry, SvgElementKind.Container, first);
    registerSvgElementHandler(registry, SvgElementKind.Container, second);
    expect(registry.elementHandlers).toHaveLength(1);
    expect(getSvgElementHandler(registry, SvgElementKind.Container)).toBe(second);
  });

  it('accepts extensions outside the built-in element vocabulary', () => {
    const registry = createSvgRegistry();
    const handler: SvgElementHandler = () => null;
    registerSvgElementHandler(registry, 'vendorElement', handler);
    expect(getSvgElementHandler(registry, 'vendorElement')).toBe(handler);
  });
});

describe('unregisterSvgElementHandler', () => {
  it('removes only a present element handler', () => {
    const registry = createSvgRegistry();
    registerSvgElementHandler(registry, SvgElementKind.Container, () => null);
    expect(unregisterSvgElementHandler(registry, SvgElementKind.Container)).toBe(true);
    expect(unregisterSvgElementHandler(registry, SvgElementKind.Container)).toBe(false);
  });
});
