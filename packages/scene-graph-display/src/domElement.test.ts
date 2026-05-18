import type { DOMElement } from '@flighthq/types';
import { DOMElementKind } from '@flighthq/types';

import { createDOMElement } from './domElement';

describe('createDOMElement', () => {
  let domElement: DOMElement;

  beforeEach(() => {
    domElement = createDOMElement();
  });

  it('initializes default values', () => {
    expect(domElement.data.element).toBeNull();
    expect(domElement.kind).toStrictEqual(DOMElementKind);
  });

  it('allows pre-defined values', () => {
    const element = {} as HTMLImageElement;
    const base = {
      data: {
        element: element,
      },
    };
    const obj = createDOMElement(base);
    expect(obj.data.element).toStrictEqual(element);
  });

  it('returns a new object for better hidden-class performance', () => {
    const base = {};
    const obj = createDOMElement(base);
    expect(obj).not.toStrictEqual(base);
  });
});
