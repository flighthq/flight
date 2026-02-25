import type { DOMObject } from '@flighthq/types';

import { createDOMObject } from './createDOMObject';

describe('createDOMObject', () => {
  let domObject: DOMObject;

  beforeEach(() => {
    domObject = createDOMObject();
  });

  it('initializes default values', () => {
    expect(domObject.data.element).toBeNull();
    expect(domObject.type).toBe('dom');
  });

  it('allows pre-defined values', () => {
    const element = {} as HTMLImageElement;
    const base = {
      data: {
        element: element,
      },
    };
    const obj = createDOMObject(base);
    expect(obj.data.element).toStrictEqual(element);
  });
});
