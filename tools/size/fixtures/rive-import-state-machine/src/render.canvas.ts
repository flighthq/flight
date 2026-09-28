// State machines alone: the machines, their layers, states and transitions.
// ★ THE SELECTIVE ENTRY IS `createRiveDocumentImportResult`, which takes the registry it is given and resolves no
// default. The zero-config `createScene2DFromRiveDocument` costs the whole importer by construction, so the subsets
// below each build the registry themselves and call only the registrars they need.
import {
  createRiveDocumentImportResult,
  createRiveImportRegistry,
  registerRiveStateMachineHandlers,
} from '@flighthq/scene2d-formats';

const registry = createRiveImportRegistry();
registerRiveStateMachineHandlers(registry);
export const result = createRiveDocumentImportResult(registry, new Uint8Array());
