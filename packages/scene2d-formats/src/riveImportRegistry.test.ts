import { createDisplayObject } from '@flighthq/scene2d/contract';
import type { RiveArtboardGraph, RiveCoreObject, RiveImportRegistry } from '@flighthq/types/contract';

import {
  applyRiveArtboardHandlers,
  applyRiveDocumentHandlers,
  createRiveArtboardImportContext,
  createRiveDocumentImportContext,
  createRiveImportRegistry,
  getRiveCoreObjectHandler,
  importRiveCoreObjectAsData,
  initializeRiveArtboardImportContext,
  initializeRiveDocumentImportContext,
  initializeRiveImportRegistry,
  registerRiveCoreObjectHandler,
} from './riveImportRegistry';

// Rive core type keys, and the inheritance that makes the registry worth keying by type: a Star is a
// Polygon is a ParametricPath is a Path, and a Fill is a ShapePaint.
const PATH = 12;
const PARAMETRIC_PATH = 15;
const STAR = 52;
const SHAPE_PAINT = 21;
const FILL = 20;
const UNKNOWN_TYPE = 999999;

describe('applyRiveArtboardHandlers', () => {
  it('runs each pass in registration order', () => {
    const order: string[] = [];
    const registry = createRiveImportRegistry();
    registerRiveCoreObjectHandler(registry, PATH, { applyArtboard: () => order.push('path') });
    registerRiveCoreObjectHandler(registry, SHAPE_PAINT, { applyArtboard: () => order.push('paint') });

    applyRiveArtboardHandlers(artboardContext(registry));

    expect(order).toEqual(['path', 'paint']);
  });

  it('runs a handler registered under several type keys exactly once', () => {
    let runs = 0;
    const registry = createRiveImportRegistry();
    // A family covering several keys with one handler is the normal case — paint alone registers seven.
    const shared = { applyArtboard: (): number => (runs += 1) };
    registerRiveCoreObjectHandler(registry, PATH, shared);
    registerRiveCoreObjectHandler(registry, SHAPE_PAINT, shared);

    applyRiveArtboardHandlers(artboardContext(registry));

    expect(runs).toBe(1);
  });

  it('skips a handler that registers no artboard pass', () => {
    const registry = createRiveImportRegistry();
    registerRiveCoreObjectHandler(registry, PATH, { importComponent: importRiveCoreObjectAsData });

    expect(() => applyRiveArtboardHandlers(artboardContext(registry))).not.toThrow();
  });
});

describe('applyRiveDocumentHandlers', () => {
  it('runs each document pass once, in registration order', () => {
    const order: string[] = [];
    const registry = createRiveImportRegistry();
    const shared = { applyDocument: (): number => order.push('shared') };
    registerRiveCoreObjectHandler(registry, PATH, shared);
    registerRiveCoreObjectHandler(registry, SHAPE_PAINT, shared);
    registerRiveCoreObjectHandler(registry, STAR, { applyDocument: () => order.push('star') });

    applyRiveDocumentHandlers(createRiveDocumentImportContext(registry, []));

    expect(order).toEqual(['shared', 'star']);
  });
});

describe('createRiveArtboardImportContext', () => {
  it('numbers the root as component zero, so nodes stay index-for-index with the artboard', () => {
    const root = createDisplayObject({ name: 'Board' });
    const context = createRiveArtboardImportContext(createRiveImportRegistry(), artboard(), [], root, []);

    expect(context.nodes).toEqual([root]);
    expect(context.root).toBe(root);
  });

  it('starts every collected output empty', () => {
    const context = createRiveArtboardImportContext(
      createRiveImportRegistry(),
      artboard(),
      [],
      createDisplayObject({}),
      ['Inter'],
    );

    expect(context.advancedBlends).toEqual([]);
    expect(context.layouts).toEqual([]);
    expect(context.stateMachines).toEqual([]);
    expect(context.skeleton).toBeNull();
    expect(context.shapePaths.size).toBe(0);
    expect(context.rebuilds.size).toBe(0);
    expect(context.fontNames).toEqual(['Inter']);
  });
});

describe('createRiveDocumentImportContext', () => {
  it('carries the whole object stream and starts with no assets', () => {
    const objects: RiveCoreObject[] = [{ properties: [], typeKey: PATH }];
    const context = createRiveDocumentImportContext(createRiveImportRegistry(), objects);

    expect(context.objects).toBe(objects);
    expect(context.assets).toEqual([]);
    expect(context.diagnostics).toBeUndefined();
  });
});

describe('createRiveImportRegistry', () => {
  it('starts empty, so nothing is read until a family is registered', () => {
    expect(createRiveImportRegistry().handlers.size).toBe(0);
  });
});

describe('getRiveCoreObjectHandler', () => {
  it('resolves a derived type through the chain it inherits', () => {
    const registry = createRiveImportRegistry();
    const path = { importComponent: importRiveCoreObjectAsData };
    registerRiveCoreObjectHandler(registry, PATH, path);

    // Star -> Polygon -> ParametricPath -> Path: one registration serves every parametric shape.
    expect(getRiveCoreObjectHandler(registry, STAR)).toBe(path);
    expect(getRiveCoreObjectHandler(registry, PARAMETRIC_PATH)).toBe(path);
    expect(getRiveCoreObjectHandler(registry, PATH)).toBe(path);
  });

  it('prefers the nearest registration, so a narrow family overrides a wide one', () => {
    const registry = createRiveImportRegistry();
    const wide = { importComponent: importRiveCoreObjectAsData };
    const narrow = { importComponent: importRiveCoreObjectAsData };
    registerRiveCoreObjectHandler(registry, PATH, wide);
    registerRiveCoreObjectHandler(registry, STAR, narrow);

    expect(getRiveCoreObjectHandler(registry, STAR)).toBe(narrow);
    expect(getRiveCoreObjectHandler(registry, PARAMETRIC_PATH)).toBe(wide);
  });

  it('returns null for a type no registration covers', () => {
    const registry = createRiveImportRegistry();
    registerRiveCoreObjectHandler(registry, PATH, { importComponent: importRiveCoreObjectAsData });

    expect(getRiveCoreObjectHandler(registry, SHAPE_PAINT)).toBeNull();
  });

  it('returns null for a key this object model does not define, rather than walking off the table', () => {
    expect(getRiveCoreObjectHandler(createRiveImportRegistry(), UNKNOWN_TYPE)).toBeNull();
  });
});

describe('importRiveCoreObjectAsData', () => {
  it('contributes no display object', () => {
    expect(importRiveCoreObjectAsData()).toBeNull();
  });
});

describe('initializeRiveArtboardImportContext', () => {
  it('fills every field of a freshly allocated context', () => {
    const root = createDisplayObject({});
    const out = {} as ReturnType<typeof createRiveArtboardImportContext>;
    const registry = createRiveImportRegistry();
    initializeRiveArtboardImportContext(out, registry, artboard(), [], root, [], []);

    expect(out.registry).toBe(registry);
    expect(out.nodes).toEqual([root]);
    expect(out.diagnostics).toEqual([]);
  });
});

describe('initializeRiveDocumentImportContext', () => {
  it('fills every field of a freshly allocated context', () => {
    const out = {} as ReturnType<typeof createRiveDocumentImportContext>;
    const registry = createRiveImportRegistry();
    initializeRiveDocumentImportContext(out, registry, []);

    expect(out.registry).toBe(registry);
    expect(out.assets).toEqual([]);
  });
});

describe('initializeRiveImportRegistry', () => {
  it('gives the registry its own handler table', () => {
    const first = {} as RiveImportRegistry;
    const second = {} as RiveImportRegistry;
    initializeRiveImportRegistry(first);
    initializeRiveImportRegistry(second);
    registerRiveCoreObjectHandler(first, PATH, { importComponent: importRiveCoreObjectAsData });

    expect(second.handlers.size).toBe(0);
  });
});

describe('registerRiveCoreObjectHandler', () => {
  it('replaces a handler for a key it already holds', () => {
    const registry = createRiveImportRegistry();
    const replacement = { importComponent: importRiveCoreObjectAsData };
    registerRiveCoreObjectHandler(registry, FILL, { importComponent: importRiveCoreObjectAsData });
    registerRiveCoreObjectHandler(registry, FILL, replacement);

    expect(registry.handlers.size).toBe(1);
    expect(getRiveCoreObjectHandler(registry, FILL)).toBe(replacement);
  });

  it('keeps a replaced key in its original pass position', () => {
    const order: string[] = [];
    const registry = createRiveImportRegistry();
    registerRiveCoreObjectHandler(registry, PATH, { applyArtboard: () => order.push('first') });
    registerRiveCoreObjectHandler(registry, SHAPE_PAINT, { applyArtboard: () => order.push('second') });
    registerRiveCoreObjectHandler(registry, PATH, { applyArtboard: () => order.push('replaced') });

    applyRiveArtboardHandlers(artboardContext(registry));

    expect(order).toEqual(['replaced', 'second']);
  });
});

function artboard(): RiveArtboardGraph {
  return { objects: [], parentIndices: [], streamEnd: 0, streamStart: 0 };
}

function artboardContext(registry: RiveImportRegistry): ReturnType<typeof createRiveArtboardImportContext> {
  return createRiveArtboardImportContext(registry, artboard(), [], createDisplayObject({}), []);
}
