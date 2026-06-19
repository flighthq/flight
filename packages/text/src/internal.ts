import type { RichTextData } from '@flighthq/types';

export type RichTextDataInternal = Omit<RichTextData, 'scrollH' | 'scrollV'> & {
  scrollH: number;
  scrollV: number;
};
