import { getNodeChildAt } from '@flighthq/node/contract';
import { createDisplayObject } from '@flighthq/scene2d/contract';
import type { DisplayObject, Node2D } from '@flighthq/types/contract';
import { DisplayObjectKind } from '@flighthq/types/contract';

import * as scene2DFormatsContract from './contract';
import {
  createRiveDocumentImportResult,
  createRiveImportRegistry,
  registerAllRiveHandlers,
  registerRiveCoreObjectHandler,
} from './index';
import * as scene2DFormatsPublic from './index';

// The two lanes are a design decision, not a convention, so the split is pinned here rather than
// left to whoever next edits `index.ts`. The line the Rive registry draws: an app composes an import
// out of families and may register a type Flight does not read, so the registry, the generic door and
// the registrars are public; the individual built-in handlers are the implementation of those
// families and stay on the contract lane, where only other `@flighthq/*` packages reach them.

// Everything a caller needs to own a Rive import: build a registry, register a type of their own,
// install a family or all of them, and run the import against what they registered.
const RIVE_PUBLIC_REGISTRY_EXPORTS = [
  'createRiveDocumentImportResult',
  'createRiveImportRegistry',
  'createScene2DFromRiveDocument',
  'registerAllRiveHandlers',
  'registerRiveCoreObjectHandler',
] as const;

const RIVE_PUBLIC_FAMILY_REGISTRARS = [
  'registerRiveAssetHandlers',
  'registerRiveClippingHandlers',
  'registerRiveDrawOrderHandlers',
  'registerRiveLayoutHandlers',
  'registerRivePaintHandlers',
  'registerRivePathHandlers',
  'registerRiveShapeHandlers',
  'registerRiveSkeletonHandlers',
  'registerRiveSoloHandlers',
  'registerRiveStateMachineHandlers',
  'registerRiveTextHandlers',
] as const;

// The built-in handlers themselves, and the machinery the driver uses to run them.
const RIVE_CONTRACT_ONLY_EXPORTS = [
  'applyRiveArtboardHandlers',
  'applyRiveDocumentHandlers',
  'createRiveArtboardImportContext',
  'createRiveDocumentImportContext',
  'getRiveCoreObjectHandler',
  'importRiveCoreObjectAsData',
  'importRiveImageComponent',
  'importRiveLayoutComponent',
  'importRiveNSlicedNodeComponent',
  'importRiveNestedArtboardComponent',
  'importRivePathComponent',
  'importRiveShapeComponent',
  'importRiveSoloComponent',
  'importRiveTextComponent',
] as const;

// A Rive core type key and the two property keys a minimal artboard needs. Spelled out rather than
// imported, because the point of these cases is that a CALLER works only from the public lane.
const RIVE_SHAPE_TYPE_KEY = 3;
const RIVE_NAME_PROPERTY = 4;
const RIVE_PARENT_ID_PROPERTY = 5;

describe('scene2d-formats exports', () => {
  it('opens the Rive registry on the public lane, so an app can own what its import reads', () => {
    for (const name of RIVE_PUBLIC_REGISTRY_EXPORTS) {
      expect(name in scene2DFormatsPublic, name).toBe(true);
    }
  });

  it('publishes every Rive family registrar, so a family can be installed without the rest', () => {
    for (const name of RIVE_PUBLIC_FAMILY_REGISTRARS) {
      expect(name in scene2DFormatsPublic, name).toBe(true);
    }
  });

  it('keeps the individual built-in handlers off the public lane', () => {
    for (const name of RIVE_CONTRACT_ONLY_EXPORTS) {
      expect(name in scene2DFormatsPublic, name).toBe(false);
    }
  });

  it('carries the whole surface on the contract lane, public names included', () => {
    for (const name of [
      ...RIVE_PUBLIC_REGISTRY_EXPORTS,
      ...RIVE_PUBLIC_FAMILY_REGISTRARS,
      ...RIVE_CONTRACT_ONLY_EXPORTS,
    ]) {
      expect(name in scene2DFormatsContract, name).toBe(true);
    }
  });
});

describe('scene2d-formats Rive registry overrides', () => {
  it('lets a caller replace a built-in family through the public door', () => {
    const registry = createRiveImportRegistry();
    registerAllRiveHandlers(registry);
    // The shape family already claims this key, so a plain Shape is what the import would produce.
    registerRiveCoreObjectHandler(registry, RIVE_SHAPE_TYPE_KEY, {
      importComponent: (_context, index): DisplayObject | null => createDisplayObject({ name: `replaced:${index}` }),
    });

    const imported = createRiveDocumentImportResult(registry, riveWithOneShape());

    expect(firstChildName(imported.artboards[0].root)).toBe('replaced:1');
  });

  it('leaves a second registry untouched, because a registry belongs to its caller', () => {
    const overridden = createRiveImportRegistry();
    registerAllRiveHandlers(overridden);
    registerRiveCoreObjectHandler(overridden, RIVE_SHAPE_TYPE_KEY, { importComponent: () => null });
    const stock = createRiveImportRegistry();
    registerAllRiveHandlers(stock);

    // The override drops the shape entirely; the untouched registry still imports it by name.
    expect(getNodeChildCountOf(createRiveDocumentImportResult(overridden, riveWithOneShape()))).toBe(0);
    expect(firstChildName(createRiveDocumentImportResult(stock, riveWithOneShape()).artboards[0].root)).toBe('box');
  });

  it('registers a type no family claims, so a caller reads what Flight does not', () => {
    const registry = createRiveImportRegistry();
    // No family at all: without this registration the shape falls to the unregistered arm and imports
    // as a plain container, which is exactly what the caller's handler is replacing.
    registerRiveCoreObjectHandler(registry, RIVE_SHAPE_TYPE_KEY, {
      importComponent: (): DisplayObject | null => createDisplayObject({ name: 'mine' }),
    });

    const imported = createRiveDocumentImportResult(registry, riveWithOneShape());

    expect(firstChildName(imported.artboards[0].root)).toBe('mine');
    expect((getNodeChildAt(imported.artboards[0].root, 0) as Node2D).kind).toBe(DisplayObjectKind);
  });
});

function firstChildName(root: Node2D): string {
  return (getNodeChildAt(root, 0) as Node2D).name ?? '';
}

function getNodeChildCountOf(imported: { artboards: readonly { root: Node2D }[] }): number {
  const root = imported.artboards[0].root;
  let count = 0;
  while (getNodeChildAt(root, count) !== null) count++;
  return count;
}

// The smallest `.riv` that carries one artboard and one shape inside it.
function riveWithOneShape(): Uint8Array {
  const out: number[] = [0x52, 0x49, 0x56, 0x45, ...varUint(7), ...varUint(0), ...varUint(0), 0];
  out.push(...varUint(1), ...varUint(RIVE_NAME_PROPERTY), ...riveText('Board'), 0);
  out.push(
    ...varUint(RIVE_SHAPE_TYPE_KEY),
    ...varUint(RIVE_NAME_PROPERTY),
    ...riveText('box'),
    ...varUint(RIVE_PARENT_ID_PROPERTY),
    ...varUint(0),
    0,
  );
  return new Uint8Array(out);
}

function riveText(value: string): number[] {
  const encoded = Array.from(new TextEncoder().encode(value));
  return [...varUint(encoded.length), ...encoded];
}

function varUint(value: number): number[] {
  const out: number[] = [];
  let remaining = value;
  do {
    const group = remaining % 128;
    remaining = Math.floor(remaining / 128);
    out.push(remaining > 0 ? group + 128 : group);
  } while (remaining > 0);
  return out;
}
