import type { ImageResource } from './ImageResource.ts';
import type { SvgClipHandlerEntry, SvgElementHandlerEntry } from './SvgRegistry.ts';

export interface SvgDocumentImportOptions {
  clipHandlers?: SvgClipHandlerEntry[];
  elementHandlers?: SvgElementHandlerEntry[];
  resolveImageResource?: (href: string) => ImageResource | null;
}
