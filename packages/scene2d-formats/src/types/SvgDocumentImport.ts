import type { ImageResource } from '@flighthq/image/contract';

import type { SvgClipHandlerEntry, SvgElementHandlerEntry } from './SvgRegistry.ts';

export interface SvgDocumentImportOptions {
  clipHandlers?: SvgClipHandlerEntry[];
  elementHandlers?: SvgElementHandlerEntry[];
  resolveImageResource?: (href: string) => ImageResource | null;
}
