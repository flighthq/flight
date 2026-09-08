import type {
  Scene2DDocument,
  Scene2DDocumentFetcher,
  Scene2DDocumentImporterRegistry,
  Scene2DDocumentLoadOptions,
} from '@flighthq/types/contract';

import { createScene2DDocumentFromBytes } from './scene2DDocumentImporterRegistry';
import { reportScene2DResourceFailure } from './scene2DResourceDiagnostics';

export async function loadScene2DDocumentFromUrl(
  url: string,
  registry: Readonly<Scene2DDocumentImporterRegistry>,
  fetchDocument: Scene2DDocumentFetcher,
  options?: Readonly<Scene2DDocumentLoadOptions>,
): Promise<Scene2DDocument | null> {
  const signal = options?.signal ?? new AbortController().signal;
  const source = await fetchDocument(url, signal, options?.progress ?? null);
  if (source === null) {
    reportScene2DResourceFailure({
      operation: 'loadScene2DDocumentFromUrl',
      reason: 'document-fetch-failed',
      total: 1,
      unresolved: 1,
      url,
    });
    return null;
  }
  return createScene2DDocumentFromBytes(source, registry, {
    mimeType: options?.mimeType ?? null,
    url,
  });
}
