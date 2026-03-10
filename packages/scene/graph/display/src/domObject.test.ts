import type { DOMObject } from '@flighthq/types';
import { DOMObjectKind } from '@flighthq/types';

import { createDOMObject } from './domObject';

describe('createDOMObject', () => {
  let domObject: DOMObject;

  beforeEach(() => {
    domObject = createDOMObject();
  });

  it('initializes default values', () => {
    expect(domObject.data.element).toBeNull();
    expect(domObject.kind).toStrictEqual(DOMObjectKind);
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

  it('returns a new object for better hidden-class performance', () => {
    const base = {};
    const obj = createDOMObject(base);
    expect(obj).not.toStrictEqual(base);
  });
});
