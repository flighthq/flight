import type { SvgElementHandler } from '@flighthq/types/contract';
import { SvgClipKind, SvgElementKind } from '@flighthq/types/contract';

import {
  createSvgRegistry,
  getSvgClipHandler,
  getSvgElementHandler,
  registerSvgClipHandler,
  registerSvgElementHandler,
  unregisterSvgClipHandler,
  unregisterSvgElementHandler,
} from './svgRegistry.ts';

describe('createSvgRegistry', () => {
  it('creates independent empty registries', () => {
    const first = createSvgRegistry();
    const second = createSvgRegistry();
    expect(first.clipHandlers).toEqual([]);
    expect(first.elementHandlers).toEqual([]);
    registerSvgElementHandler(first, SvgElementKind.Container, () => null);
    expect(first.elementHandlers).toHaveLength(1);
    expect(second.elementHandlers).toEqual([]);
  });
});

describe('getSvgClipHandler', () => {
  it('returns null for an unregistered clip kind, which is how declining the family reads', () => {
    expect(getSvgClipHandler(createSvgRegistry(), SvgClipKind.Path)).toBeNull();
  });
});

describe('getSvgElementHandler', () => {
  it('returns null for an unregistered element kind', () => {
    expect(getSvgElementHandler(createSvgRegistry(), SvgElementKind.Container)).toBeNull();
  });
});

describe('registerSvgClipHandler', () => {
  it('is last-write-wins on the clip family too, and touches no element handler', () => {
    const registry = createSvgRegistry();
    const first = (): void => {};
    const second = (): void => {};
    registerSvgClipHandler(registry, SvgClipKind.Path, first);
    registerSvgClipHandler(registry, SvgClipKind.Path, second);
    expect(registry.clipHandlers).toHaveLength(1);
    expect(getSvgClipHandler(registry, SvgClipKind.Path)).toBe(second);
    expect(registry.elementHandlers).toEqual([]);
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

describe('unregisterSvgClipHandler', () => {
  it('reports whether a clip kind was registered', () => {
    const registry = createSvgRegistry();
    expect(unregisterSvgClipHandler(registry, SvgClipKind.Path)).toBe(false);
    registerSvgClipHandler(registry, SvgClipKind.Path, () => {});
    expect(unregisterSvgClipHandler(registry, SvgClipKind.Path)).toBe(true);
    expect(registry.clipHandlers).toEqual([]);
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
