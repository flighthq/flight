import type { DisplayObject } from '@flighthq/types';
import { DisplayObjectKind } from '@flighthq/types';

import { createDisplayObject, createDisplayObjectRuntime, getDisplayObjectRuntime } from './displayContainer';

describe('createDisplayObject', () => {
  let displayContainer: DisplayObject;

  beforeEach(() => {
    displayContainer = createDisplayObject();
  });

  it('initializes default values', () => {
    expect(displayContainer.kind).toStrictEqual(DisplayObjectKind);
  });

  it('returns a new object for better hidden-class performance', () => {
    const base = {};
    const obj = createDisplayObject(base);
    expect(obj).not.toStrictEqual(base);
  });
});

describe('createDisplayObjectRuntime', () => {
  it('returns a non-null runtime', () => {
    const runtime = createDisplayObjectRuntime();
    expect(runtime).not.toBeNull();
  });
});

describe('getDisplayObjectRuntime', () => {
  it('returns the runtime for a DisplayObject', () => {
    const container = createDisplayObject();
    const runtime = getDisplayObjectRuntime(container);
    expect(runtime).not.toBeNull();
  });
});
