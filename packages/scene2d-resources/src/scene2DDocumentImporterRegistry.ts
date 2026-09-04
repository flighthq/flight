import { allocateEntity, finishEntity } from '@flighthq/entity/contract';
import type {
  EntityConstruction,
  Scene2DDocument,
  Scene2DDocumentImportContext,
  Scene2DDocumentImporter,
  Scene2DDocumentImporterMatcher,
  Scene2DDocumentImporterRegistry,
} from '@flighthq/types/contract';

export function createScene2DDocumentFromBytes(
  source: Uint8Array,
  registry: Readonly<Scene2DDocumentImporterRegistry>,
  context: Readonly<Scene2DDocumentImportContext> = { mimeType: null, url: null },
): Scene2DDocument | null {
  for (let i = 0; i < registry.entries.length; i++) {
    const entry = registry.entries[i];
    if (!entry.matches(source, context)) continue;
    const document = entry.importDocument(source, context);
    if (document !== null && document.sourceKind === null) document.sourceKind = entry.kind;
    return document;
  }
  return null;
}

export function createScene2DDocumentImporterRegistry(): Scene2DDocumentImporterRegistry {
  const out = allocateEntity<Scene2DDocumentImporterRegistry>();
  initializeScene2DDocumentImporterRegistry(out);
  return finishEntity(out);
}

export function initializeScene2DDocumentImporterRegistry(
  out: EntityConstruction<Scene2DDocumentImporterRegistry>,
): void {
  out.entries = [];
}

export function registerScene2DDocumentImporter(
  registry: Scene2DDocumentImporterRegistry,
  kind: string,
  matches: Scene2DDocumentImporterMatcher,
  importDocument: Scene2DDocumentImporter,
): void {
  const index = registry.entries.findIndex((entry) => entry.kind === kind);
  const entry = { importDocument, kind, matches };
  if (index === -1) registry.entries.push(entry);
  else registry.entries[index] = entry;
}

export function unregisterScene2DDocumentImporter(registry: Scene2DDocumentImporterRegistry, kind: string): boolean {
  const index = registry.entries.findIndex((entry) => entry.kind === kind);
  if (index === -1) return false;
  registry.entries.splice(index, 1);
  return true;
}
