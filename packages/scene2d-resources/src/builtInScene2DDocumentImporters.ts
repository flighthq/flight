import { createScene2DFromLottieDocument, createScene2DFromSvgDocument } from '@flighthq/scene2d-formats/contract';
import type {
  Scene2DDocument,
  Scene2DDocumentImportContext,
  Scene2DDocumentImporterRegistry,
} from '@flighthq/types/contract';

import { createScene2DDocument } from './scene2DDocument';
import { registerScene2DDocumentImporter } from './scene2DDocumentImporterRegistry';

export function registerLottieScene2DDocumentImporter(registry: Scene2DDocumentImporterRegistry): void {
  registerScene2DDocumentImporter(registry, 'lottie', matchesLottieDocument, importLottieDocument);
}

export function registerSvgScene2DDocumentImporter(registry: Scene2DDocumentImporterRegistry): void {
  registerScene2DDocumentImporter(registry, 'svg', matchesSvgDocument, importSvgDocument);
}

function importLottieDocument(source: Uint8Array, _context: Readonly<Scene2DDocumentImportContext>): Scene2DDocument {
  return createScene2DDocument(createScene2DFromLottieDocument(decodeText(source)).root, [], 'lottie');
}

function importSvgDocument(source: Uint8Array, _context: Readonly<Scene2DDocumentImportContext>): Scene2DDocument {
  return createScene2DDocument(createScene2DFromSvgDocument(decodeText(source)), [], 'svg');
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

const _decoder = new TextDecoder();
