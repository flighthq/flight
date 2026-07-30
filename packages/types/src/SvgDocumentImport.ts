import type { Image } from './Image';

/**
 * External-resource seams for static SVG document import. The importer performs no hidden I/O:
 * callers that want `<image>` nodes resolve each URL or data URI to an already-owned Image.
 */
export interface SvgDocumentImportOptions {
  resolveImageResource?: (href: string) => Image | null;
}
