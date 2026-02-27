import type { DisplayObject as DisplayObjectModel } from '@flighthq/types';

import type DisplayObject from '../DisplayObject';

export type DisplayObjectInternal = Omit<DisplayObject, 'model'> & {
  model: DisplayObjectModel;
};
