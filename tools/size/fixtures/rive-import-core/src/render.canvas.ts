// No family at all: the selective core, the object graph and the record walk, with every registrar declined. This is the floor every other subset is measured against.
// ★ THE SELECTIVE ENTRY IS `createRiveDocumentImportResult`, which takes the registry it is given and resolves no
// default. The zero-config `createScene2DFromRiveDocument` costs the whole importer by construction, so the subsets
// below each build the registry themselves and call only the registrars they need.
import { createRiveDocumentImportResult, createRiveImportRegistry } from '@flighthq/scene2d-formats';

const registry = createRiveImportRegistry();

export const result = createRiveDocumentImportResult(registry, new Uint8Array());
