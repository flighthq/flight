import type { DisplayObject as DisplayObjectType } from '@flighthq/types';

import type DisplayObject from '../DisplayObject';

export type DisplayObjectInternal = Omit<DisplayObject, 'value'> & {
  value: DisplayObjectType;
};
