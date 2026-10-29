import { allocateEntity, finishEntity } from '@flighthq/entity/contract';
import type { EntityConstruction } from '@flighthq/entity/contract';

import type { RichTextContent } from './types.ts';

export function createRichTextContent(): RichTextContent {
  const out = allocateEntity<RichTextContent>();
  initializeRichTextContent(out);
  return finishEntity(out);
}

export function initializeRichTextContent(out: EntityConstruction<RichTextContent>): void {
  out.formatRanges = [];
  out.text = '';
}
