import type { DOMElement } from '@flighthq/types';
import { DOMElementKind } from '@flighthq/types';

import { createDOMElement, createDOMElementData, createDOMElementRuntime, getDOMElementRuntime } from './domElement';

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

describe('createDOMElementData', () => {
  it('returns default values', () => {
    const data = createDOMElementData();
    expect(data.element).toBeNull();
  });

  it('allows pre-defined values', () => {
    const element = {} as HTMLImageElement;
    const data = createDOMElementData({ element });
    expect(data.element).toBe(element);
  });
});

describe('createDOMElementRuntime', () => {
  it('returns a non-null runtime', () => {
    const runtime = createDOMElementRuntime();
    expect(runtime).not.toBeNull();
  });
});

describe('getDOMElementRuntime', () => {
  it('returns the runtime for a DOMElement', () => {
    const domElement = createDOMElement();
    const runtime = getDOMElementRuntime(domElement);
    expect(runtime).not.toBeNull();
  });
});
