import type { ImageResource } from './ImageResource.ts';
import type { SvgElementHandlerEntry } from './SvgRegistry.ts';

export interface SvgDocumentImportOptions {
  elementHandlers?: SvgElementHandlerEntry[];
  resolveImageResource?: (href: string) => ImageResource | null;
}
