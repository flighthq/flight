import * as scene2DFormatsContract from './contract';
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
