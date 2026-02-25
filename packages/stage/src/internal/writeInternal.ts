import type { DisplayObject, RichTextData, Stage } from '@flighthq/types';

export type DisplayObjectInternal = Omit<DisplayObject, 'children' | 'parent' | 'stage'> & {
  children: DisplayObject[] | null;
  parent: DisplayObject | null;
  stage: Stage | null;
};

export type RichTextDataInternal = Omit<RichTextData, 'scrollH' | 'scrollV'> & {
  scrollH: number;
  scrollV: number;
};
