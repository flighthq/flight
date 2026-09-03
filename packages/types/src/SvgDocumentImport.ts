import type { ImageResource } from './ImageResource';

/**
 * External-resource seams for static SVG document import. The importer performs no hidden I/O:
 * callers that want `<image>` nodes resolve each URL or data URI to an already-owned ImageResource.
 */
export interface SvgDocumentImportOptions {
  resolveImageResource?: (href: string) => ImageResource | null;
}
