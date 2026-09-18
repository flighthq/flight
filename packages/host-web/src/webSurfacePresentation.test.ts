import { createWebSurfaceFromElement } from './webSurfaceHandle';
import { appendWebSurface, getWebSurfaceCanvas, getWebSurfaceElement } from './webSurfacePresentation';

afterEach(() => document.body.replaceChildren());

describe('appendWebSurface', () => {
  it('anchors the drawable in the given parent', () => {
    const canvas = document.createElement('canvas');
    const parent = document.createElement('div');

    expect(appendWebSurface(createWebSurfaceFromElement(canvas), parent)).toBe(true);
    expect(parent.firstElementChild).toBe(canvas);
  });

  // Allocation and presentation are separate acts: a surface is renderable before it is ever in the DOM,
  // which is what keeps the headless path open.
  it('leaves a surface unattached until it is called', () => {
    const surface = createWebSurfaceFromElement(document.createElement('canvas'));

    expect(getWebSurfaceElement(surface)!.parentElement).toBeNull();
    appendWebSurface(surface, document.body);
    expect(getWebSurfaceElement(surface)!.parentElement).toBe(document.body);
  });

  it('returns false for a surface whose drawable is not an element', () => {
    expect(appendWebSurface(createWebSurfaceFromElement(7 as unknown as HTMLElement), document.body)).toBe(false);
  });
});

describe('getWebSurfaceCanvas', () => {
  it('returns the canvas backing the surface', () => {
    const canvas = document.createElement('canvas');

    expect(getWebSurfaceCanvas(createWebSurfaceFromElement(canvas))).toBe(canvas);
  });

  it('returns null when the drawable is not a canvas', () => {
    expect(getWebSurfaceCanvas(createWebSurfaceFromElement(document.createElement('div')))).toBeNull();
  });
});

describe('getWebSurfaceElement', () => {
  it('returns the element the surface was built around', () => {
    const div = document.createElement('div');

    expect(getWebSurfaceElement(createWebSurfaceFromElement(div))).toBe(div);
  });
});
