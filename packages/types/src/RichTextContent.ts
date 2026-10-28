import type { TextFormatRangeRaw as TextFormatRange } from '@flighthq/textformat/contract';

import type { Entity } from './Entity.ts';

export interface RichTextContent extends Entity {
  formatRanges: TextFormatRange[];
  text: string;
}
