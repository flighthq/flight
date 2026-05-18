import type { DisplayContainer } from '@flighthq/types';
import { DisplayObjectKind } from '@flighthq/types';

import { createDisplayContainer } from './displayContainer';

describe('createDisplayContainer', () => {
  let displayContainer: DisplayContainer;

  beforeEach(() => {
    displayContainer = createDisplayContainer();
  });

  it('initializes default values', () => {
    expect(displayContainer.kind).toStrictEqual(DisplayObjectKind);
  });

  it('returns a new object for better hidden-class performance', () => {
    const base = {};
    const obj = createDisplayContainer(base);
    expect(obj).not.toStrictEqual(base);
  });
});
