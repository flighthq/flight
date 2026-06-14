import type { DisplayContainer } from '@flighthq/types';
import { DisplayObjectKind } from '@flighthq/types';

import { createDisplayContainer, createDisplayContainerRuntime, getDisplayContainerRuntime } from './displayContainer';

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

describe('createDisplayContainerRuntime', () => {
  it('returns a non-null runtime', () => {
    const runtime = createDisplayContainerRuntime();
    expect(runtime).not.toBeNull();
  });
});

describe('getDisplayContainerRuntime', () => {
  it('returns the runtime for a DisplayContainer', () => {
    const container = createDisplayContainer();
    const runtime = getDisplayContainerRuntime(container);
    expect(runtime).not.toBeNull();
  });
});
