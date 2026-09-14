import type { SwfTagHandler, SwfTagHandlerRegistry } from '@flighthq/types/contract';

import {
  createSwfTagHandlerRegistry,
  registerAllSwfTagHandlers,
  registerSwfDefinitionTagHandlers,
  registerSwfPlacementTagHandlers,
  registerSwfScriptTagHandlers,
  registerSwfSoundTagHandlers,
  registerSwfTagHandler,
  registerSwfTimelineTagHandlers,
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
    registerSwfDefinitionTagHandlers(separateRegistry);
    registerSwfPlacementTagHandlers(separateRegistry);
    registerSwfScriptTagHandlers(separateRegistry);
    registerSwfSoundTagHandlers(separateRegistry);
    registerSwfTimelineTagHandlers(separateRegistry);
    expect(registry.size).toBe(separateRegistry.size);
  });
});

describe('registerSwfDefinitionTagHandlers', () => {
  it('registers definition-related tag codes', () => {
    const registry = createSwfTagHandlerRegistry();
    registerSwfDefinitionTagHandlers(registry);
    expectHandlers(
      registry,
      [2, 6, 7, 8, 9, 10, 11, 13, 14, 20, 21, 22, 32, 33, 34, 35, 36, 37, 46, 48, 56, 60, 62, 75, 76, 78, 83, 84, 90],
    );
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

describe('registerSwfSoundTagHandlers', () => {
  it('registers sound-related tag codes', () => {
    const registry = createSwfTagHandlerRegistry();
    registerSwfSoundTagHandlers(registry);
    expectHandlers(registry, [15, 18, 19, 45, 89]);
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

describe('registerSwfTimelineTagHandlers', () => {
  it('registers timeline-related tag codes', () => {
    const registry = createSwfTagHandlerRegistry();
    registerSwfTimelineTagHandlers(registry);
    expectHandlers(registry, [43, 86]);
  });
});

function expectHandlers(registry: SwfTagHandlerRegistry, codes: readonly number[]): void {
  expect(registry.size).toBe(codes.length);
  for (const code of codes) {
    expect(registry.has(code)).toBe(true);
  }
}
