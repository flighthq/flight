// Clipping alone: the clip components and the path-boolean kernel they intersect through.
// ★ THE KERNEL IS AN ARGUMENT, NOT A DEPENDENCY OF THE FAMILY. `registerRiveClippingHandlers` takes it, so a caller
// chooses which boolean implementation the clip pass uses — and a build that registers no clipping links no kernel at
// all, which is why this fixture is the only Rive subset that names `@flighthq/path-boolean`.
import { createMartinezPathBooleanKernel } from '@flighthq/path-boolean';
import {
  createRiveDocumentImportResult,
  createRiveImportRegistry,
  registerRiveClippingHandlers,
} from '@flighthq/scene2d-formats';

const registry = createRiveImportRegistry();
registerRiveClippingHandlers(createMartinezPathBooleanKernel(), registry);

export const result = createRiveDocumentImportResult(registry, new Uint8Array());
