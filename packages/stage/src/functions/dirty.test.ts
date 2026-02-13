import type { DisplayObject } from '@flighthq/types';
import { DirtyFlags } from '@flighthq/types';

import { createDisplayObject } from './createDisplayObject';
import { getDerivedState } from './derived';
import { invalidate } from './dirty';

describe('invalidate', () => {
  let displayObject: DisplayObject;

  beforeEach(() => {
    displayObject = createDisplayObject();
  });
  describe('dirty flag propagation', () => {
    it('transform invalidation also dirties transformed bounds', () => {
      invalidate(displayObject, DirtyFlags.Transform);

      const state = getDerivedState(displayObject);
      expect(state.dirtyFlags).toBe(DirtyFlags.Transform | DirtyFlags.TransformedBounds);
    });

    it('bounds invalidation also dirties transformed bounds', () => {
      invalidate(displayObject, DirtyFlags.Bounds);

      const state = getDerivedState(displayObject);
      expect(state.dirtyFlags).toBe(DirtyFlags.Bounds | DirtyFlags.TransformedBounds);
    });
  });
});
