import { createScene2DFromLottieDocument, createScene2DFromSvgDocument } from '@flighthq/scene2d-formats/contract';
import type {
  ImportDiagnostic,
  Scene2DDocument,
  Scene2DDocumentImportContext,
  Scene2DDocumentImporterRegistry,
} from '@flighthq/types/contract';
import { ImportDiagnosticSeverity } from '@flighthq/types/contract';

import { createScene2DDocument } from './scene2DDocument';
import { registerScene2DDocumentImporter } from './scene2DDocumentImporterRegistry';

export function registerLottieScene2DDocumentImporter(registry: Scene2DDocumentImporterRegistry): void {
  registerScene2DDocumentImporter(registry, 'lottie', matchesLottieDocument, importLottieDocument);
}

export function registerSvgScene2DDocumentImporter(registry: Scene2DDocumentImporterRegistry): void {
  registerScene2DDocumentImporter(registry, 'svg', matchesSvgDocument, importSvgDocument);
}

function importLottieDocument(
  source: Uint8Array,
  _context: Readonly<Scene2DDocumentImportContext>,
): Scene2DDocument | null {
  const diagnostics: ImportDiagnostic[] = [];
  const result = createScene2DFromLottieDocument(decodeText(source), diagnostics);
  if (isInvalidDocument(diagnostics, 'lottie.invalid-document')) return null;
  return createScene2DDocument(result.root, [], 'lottie');
}

function importSvgDocument(
  source: Uint8Array,
  _context: Readonly<Scene2DDocumentImportContext>,
): Scene2DDocument | null {
  const diagnostics: ImportDiagnostic[] = [];
  const root = createScene2DFromSvgDocument(decodeText(source), diagnostics);
  if (isInvalidDocument(diagnostics, 'svg.invalid-document')) return null;
  return createScene2DDocument(root, [], 'svg');
}

function matchesLottieDocument(source: Uint8Array, context: Readonly<Scene2DDocumentImportContext>): boolean {
  if (context.mimeType === 'application/lottie+json') return true;
  const text = decodeText(source).trimStart();
  return text.startsWith('{') && text.includes('"layers"') && text.includes('"fr"');
}

function matchesSvgDocument(source: Uint8Array, context: Readonly<Scene2DDocumentImportContext>): boolean {
  if (context.mimeType === 'image/svg+xml') return true;
  return /^(?:<\?xml[^>]*>\s*)?<svg(?:\s|>)/i.test(decodeText(source).trimStart());
}

function decodeText(source: Uint8Array): string {
  return _decoder.decode(source);
}

function isInvalidDocument(diagnostics: Readonly<ImportDiagnostic[]>, kind: string): boolean {
  return diagnostics.some(
    (diagnostic) => diagnostic.kind === kind && diagnostic.severity === ImportDiagnosticSeverity.Reject,
  );
}

const _decoder = new TextDecoder();
