import type { PathBooleanKernel, RiveCoreObjectHandler, RiveImportRegistry } from '@flighthq/types/contract';

import { registerAllRiveHandlers } from './riveHandlers.ts';
import { createRiveImportRegistry } from './riveImportRegistry.ts';
import {
  applyRiveImportOptions,
  createRiveImportRegistryFromOptions,
  riveAllPathBooleanRegistrars,
  riveAllRegistrars,
  riveFullImportOptions,
} from './riveRegistrars.ts';
import { registerRiveTextHandlers } from './riveText.ts';

// The clipping registrar stores the kernel for later use and never calls it while registering, so a stub is
// enough to exercise every path here and keeps this test free of a real path-boolean implementation.
const KERNEL = {} as Readonly<PathBooleanKernel>;

describe('applyRiveImportOptions', () => {
  it('installs only the families named, leaving every other core type unclaimed', () => {
    const registry = createRiveImportRegistry();
    applyRiveImportOptions({ registrars: [registerRiveTextHandlers] }, KERNEL, registry);
    const textOnly = createRiveImportRegistry();
    registerRiveTextHandlers(textOnly);
    expect([...registry.handlers.keys()].sort()).toEqual([...textOnly.handlers.keys()].sort());
  });

  it('installs nothing for empty options, rather than falling back to the full preset', () => {
    const registry = createRiveImportRegistry();
    applyRiveImportOptions({}, KERNEL, registry);
    expect(registry.handlers.size).toBe(0);
  });

  it('applies a kernel-dependent registrar with the kernel it was given', () => {
    const registry = createRiveImportRegistry();
    applyRiveImportOptions({ pathBooleanRegistrars: riveAllPathBooleanRegistrars }, KERNEL, registry);
    expect(registry.handlers.size).toBeGreaterThan(0);
  });

  // ★ WHY KERNEL-DEPENDENT REGISTRARS GO FIRST, asserted as the behaviour it protects rather than as the order
  // itself. Insertion order IS pass order, and clipping's artboard pass runs FIRST in the shipped import — so
  // applying the registry-only list first would move it last, and every other pass would see an unclipped
  // artboard. This is the specific regression the rule exists to prevent.
  it('runs the clipping artboard pass first, as the shipped import does', () => {
    expect(artboardPassOrder(fromPreset())[0]).toBe(artboardPassOrder(fromRegisterAll())[0]);
    expect(artboardPassOrder(fromPreset()).length).toBeGreaterThan(1);
  });
});

describe('createRiveImportRegistryFromOptions', () => {
  it('builds a registry carrying exactly the families the options name', () => {
    const registry = createRiveImportRegistryFromOptions({ registrars: [registerRiveTextHandlers] }, KERNEL);
    const textOnly = createRiveImportRegistry();
    registerRiveTextHandlers(textOnly);
    expect([...registry.handlers.keys()].sort()).toEqual([...textOnly.handlers.keys()].sort());
  });

  it('returns an empty registry for empty options', () => {
    expect(createRiveImportRegistryFromOptions({}, KERNEL).handlers.size).toBe(0);
  });
});

describe('riveAllPathBooleanRegistrars', () => {
  it('holds the registrars that need a kernel, and no others', () => {
    // Each one must accept the kernel-taking shape: applying it through the seam registers something.
    for (const registrar of riveAllPathBooleanRegistrars) {
      const registry = createRiveImportRegistry();
      registrar(KERNEL, registry);
      expect(registry.handlers.size).toBeGreaterThan(0);
    }
    expect(riveAllPathBooleanRegistrars.length).toBeGreaterThan(0);
  });
});

describe('riveAllRegistrars', () => {
  it('holds registrars that need only the registry', () => {
    for (const registrar of riveAllRegistrars) {
      const registry = createRiveImportRegistry();
      registrar(registry);
      expect(registry.handlers.size).toBeGreaterThan(0);
    }
  });

  it('claims each core type once, so two families cannot both own one key', () => {
    const owners = new Map<number, number>();
    for (const [index, registrar] of riveAllRegistrars.entries()) {
      const registry = createRiveImportRegistry();
      registrar(registry);
      for (const key of registry.handlers.keys()) {
        expect(owners.has(key), `core type ${key} claimed twice`).toBe(false);
        owners.set(key, index);
      }
    }
  });
});

describe('riveFullImportOptions', () => {
  // ★ THE EQUIVALENCE THAT MAKES THE PRESET HONEST. Naming it has to be the same import as calling
  // `registerAllRiveHandlers`, or a caller who "selected everything" would silently get a different parse.
  // Compared on the key SET and on the two PASS sequences, which is what the registry contract governs — not on
  // raw insertion order, which differs and is not observable.
  it('reproduces what registerAllRiveHandlers installs', () => {
    const preset = fromPreset();
    const shipped = fromRegisterAll();
    expect([...preset.handlers.keys()].sort()).toEqual([...shipped.handlers.keys()].sort());
    expect(artboardPassOrder(preset)).toEqual(artboardPassOrder(shipped));
    expect(documentPassOrder(preset)).toEqual(documentPassOrder(shipped));
  });

  it('is plain data — two lists of function references and nothing else', () => {
    expect(Object.keys(riveFullImportOptions).sort()).toEqual(['pathBooleanRegistrars', 'registrars']);
    for (const registrar of [...riveFullImportOptions.registrars!, ...riveFullImportOptions.pathBooleanRegistrars!]) {
      expect(typeof registrar).toBe('function');
    }
  });

  // ★ NOTHING REGISTERS ON IMPORT. This module is imported by the time this test runs, so a fresh registry
  // being empty is the proof that importing it mutated nothing — the repository's `sideEffects: false` claim for
  // this package depends on it, and a generated manifest module that registered on import would break it.
  it('leaves a fresh registry empty, since importing installs nothing', () => {
    expect(createRiveImportRegistry().handlers.size).toBe(0);
  });
});

function fromPreset(): RiveImportRegistry {
  return createRiveImportRegistryFromOptions(riveFullImportOptions, KERNEL);
}

function fromRegisterAll(): RiveImportRegistry {
  const registry = createRiveImportRegistry();
  registerAllRiveHandlers(KERNEL, registry);
  return registry;
}

function artboardPassOrder(registry: Readonly<RiveImportRegistry>): readonly number[] {
  return passOrder(registry, (handler) => handler.applyArtboard !== undefined);
}

function documentPassOrder(registry: Readonly<RiveImportRegistry>): readonly number[] {
  return passOrder(registry, (handler) => handler.applyDocument !== undefined);
}

function passOrder(
  registry: Readonly<RiveImportRegistry>,
  has: (handler: Readonly<RiveCoreObjectHandler>) => boolean,
): readonly number[] {
  return [...registry.handlers.entries()].filter(([, handler]) => has(handler)).map(([key]) => key);
}
