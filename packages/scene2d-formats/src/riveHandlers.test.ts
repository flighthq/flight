import { martinezPathBooleanKernel } from '@flighthq/path-boolean/contract';

import { registerAllRiveHandlers } from './riveHandlers.ts';
import { createRiveImportRegistry, getRiveCoreObjectHandler } from './riveImportRegistry.ts';

const kernel = martinezPathBooleanKernel;

// One entry per family, named by the Rive core type that family is anchored on. A type that resolves
// to no handler is a family this registrar forgot to install.
const FAMILY_ANCHORS: ReadonlyArray<readonly [string, number]> = [
  ['shape', 3],
  ['path', 12],
  ['paint', 21],
  ['clipping', 42],
  ['draw order', 49],
  ['solo', 147],
  ['layout', 409],
  ['text', 134],
  ['skeleton', 40],
  ['state machine', 53],
  ['asset', 103],
];

describe('registerAllRiveHandlers', () => {
  it('installs every family this package reads', () => {
    const registry = createRiveImportRegistry();
    registerAllRiveHandlers(kernel, registry);

    const missing = FAMILY_ANCHORS.filter(([, typeKey]) => getRiveCoreObjectHandler(registry, typeKey) === null);
    expect(missing.map(([name]) => name)).toEqual([]);
  });

  it('runs clipping before the shape pass, which replaces the records clipping reads', () => {
    const registry = createRiveImportRegistry();
    registerAllRiveHandlers(kernel, registry);

    const passes = [...registry.handlers.entries()]
      .filter(([, handler]) => handler.applyArtboard !== undefined)
      .map(([typeKey]) => typeKey);

    expect(passes.indexOf(42)).toBeLessThan(passes.indexOf(3));
  });

  it('runs the skeleton pass before layout, so a rigged artboard is flattened first', () => {
    const registry = createRiveImportRegistry();
    registerAllRiveHandlers(kernel, registry);

    const passes = [...registry.handlers.entries()]
      .filter(([, handler]) => handler.applyArtboard !== undefined)
      .map(([typeKey]) => typeKey);

    expect(passes.indexOf(39)).toBeLessThan(passes.indexOf(409));
  });
});
