import type { SwfTagHandler, SwfTagHandlerRegistry } from '@flighthq/types/contract';

import {
  createSwfTagHandlerRegistry,
  registerAllSwfTagHandlers,
  registerSwfBitmapTagHandlers,
  registerSwfControlTagHandlers,
  registerSwfFontTagHandlers,
  registerSwfPlacementTagHandlers,
  registerSwfScriptTagHandlers,
  registerSwfShapeTagHandlers,
  registerSwfSoundTagHandlers,
  registerSwfTagHandler,
  registerSwfTextTagHandlers,
  registerSwfVideoTagHandlers,
} from './swfTagRegistry';

describe('createSwfTagHandlerRegistry', () => {
  it('returns an empty map', () => {
    const registry = createSwfTagHandlerRegistry();
    expect(registry.size).toBe(0);
  });
});

describe('registerAllSwfTagHandlers', () => {
  it('populates the registry with all handler tag codes', () => {
    const registry = createSwfTagHandlerRegistry();
    registerAllSwfTagHandlers(registry);
    expect(registry.size).toBeGreaterThan(0);
    const separateRegistry = createSwfTagHandlerRegistry();
    registerSwfBitmapTagHandlers(separateRegistry);
    registerSwfControlTagHandlers(separateRegistry);
    registerSwfFontTagHandlers(separateRegistry);
    registerSwfPlacementTagHandlers(separateRegistry);
    registerSwfScriptTagHandlers(separateRegistry);
    registerSwfShapeTagHandlers(separateRegistry);
    registerSwfSoundTagHandlers(separateRegistry);
    registerSwfTextTagHandlers(separateRegistry);
    registerSwfVideoTagHandlers(separateRegistry);
    expect(registry.size).toBe(separateRegistry.size);
  });

  it('produces no overlapping tag codes across families', () => {
    const families = [
      registerSwfBitmapTagHandlers,
      registerSwfControlTagHandlers,
      registerSwfFontTagHandlers,
      registerSwfPlacementTagHandlers,
      registerSwfScriptTagHandlers,
      registerSwfShapeTagHandlers,
      registerSwfSoundTagHandlers,
      registerSwfTextTagHandlers,
      registerSwfVideoTagHandlers,
    ];
    const allCodes = new Set<number>();
    let totalCodes = 0;
    for (const register of families) {
      const registry = createSwfTagHandlerRegistry();
      register(registry);
      totalCodes += registry.size;
      for (const code of registry.keys()) allCodes.add(code);
    }
    expect(allCodes.size).toBe(totalCodes);
  });
});

describe('registerSwfBitmapTagHandlers', () => {
  it('registers bitmap-related tag codes', () => {
    const registry = createSwfTagHandlerRegistry();
    registerSwfBitmapTagHandlers(registry);
    expectHandlers(registry, [6, 8, 20, 21, 35, 36, 90]);
  });
});

describe('registerSwfControlTagHandlers', () => {
  it('registers control-related tag codes', () => {
    const registry = createSwfTagHandlerRegistry();
    registerSwfControlTagHandlers(registry);
    expectHandlers(registry, [7, 9, 34, 43, 56, 76, 78, 86]);
  });
});

describe('registerSwfFontTagHandlers', () => {
  it('registers font-related tag codes', () => {
    const registry = createSwfTagHandlerRegistry();
    registerSwfFontTagHandlers(registry);
    expectHandlers(registry, [10, 13, 48, 62, 75]);
  });
});

describe('registerSwfPlacementTagHandlers', () => {
  it('registers placement-related tag codes', () => {
    const registry = createSwfTagHandlerRegistry();
    registerSwfPlacementTagHandlers(registry);
    expectHandlers(registry, [4, 5, 26, 28, 70, 94]);
  });
});

describe('registerSwfScriptTagHandlers', () => {
  it('registers script-related tag codes', () => {
    const registry = createSwfTagHandlerRegistry();
    registerSwfScriptTagHandlers(registry);
    expectHandlers(registry, [12, 59, 72, 82]);
  });
});

describe('registerSwfShapeTagHandlers', () => {
  it('registers shape-related tag codes', () => {
    const registry = createSwfTagHandlerRegistry();
    registerSwfShapeTagHandlers(registry);
    expectHandlers(registry, [2, 22, 32, 46, 83, 84]);
  });
});

describe('registerSwfSoundTagHandlers', () => {
  it('registers sound-related tag codes', () => {
    const registry = createSwfTagHandlerRegistry();
    registerSwfSoundTagHandlers(registry);
    expectHandlers(registry, [14, 15, 18, 19, 45, 89]);
  });
});

describe('registerSwfTagHandler', () => {
  it('registers a custom handler for a given tag code', () => {
    const registry = createSwfTagHandlerRegistry();
    const handler: SwfTagHandler = () => true;
    registerSwfTagHandler(registry, 999, handler);
    expect(registry.get(999)).toBe(handler);
  });

  it('overwrites a previously registered handler for the same code', () => {
    const registry = createSwfTagHandlerRegistry();
    const first: SwfTagHandler = () => true;
    const second: SwfTagHandler = () => false;
    registerSwfTagHandler(registry, 42, first);
    registerSwfTagHandler(registry, 42, second);
    expect(registry.get(42)).toBe(second);
  });
});

describe('registerSwfTextTagHandlers', () => {
  it('registers text-related tag codes', () => {
    const registry = createSwfTagHandlerRegistry();
    registerSwfTextTagHandlers(registry);
    expectHandlers(registry, [11, 33, 37]);
  });
});

describe('registerSwfVideoTagHandlers', () => {
  it('registers video-related tag codes', () => {
    const registry = createSwfTagHandlerRegistry();
    registerSwfVideoTagHandlers(registry);
    expectHandlers(registry, [60]);
  });
});

function expectHandlers(registry: SwfTagHandlerRegistry, codes: readonly number[]): void {
  expect(registry.size).toBe(codes.length);
  for (const code of codes) {
    expect(registry.has(code)).toBe(true);
  }
}
