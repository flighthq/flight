import type { DisplayObject } from '@flighthq/types';

export type DisplayObjectInternal = Omit<DisplayObject, 'children' | 'parent' | 'stage'> & {
  children: DisplayObject[] | null;
  parent: DisplayObject | null;
  stage: DisplayObject | null;
};
