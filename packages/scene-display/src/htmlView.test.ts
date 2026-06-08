import { createRectangle } from '@flighthq/geometry';
import type { HTMLView, SceneNode } from '@flighthq/types';
import { HTMLViewKind } from '@flighthq/types';

import {
  computeHTMLViewLocalBoundsRectangle,
  createHTMLView,
  createHTMLViewData,
  createHTMLViewRuntime,
  getHTMLViewRuntime,
  setHTMLViewSize,
} from './htmlView';

describe('computeHTMLViewLocalBoundsRectangle', () => {
  it('sets out dimensions from data width and height', () => {
    const htmlView = createHTMLView({ data: { width: 320, height: 240 } });
    const out = createRectangle();
    computeHTMLViewLocalBoundsRectangle(out, htmlView as unknown as SceneNode);
    expect(out.width).toBe(320);
    expect(out.height).toBe(240);
  });
});

describe('createHTMLView', () => {
  let htmlView: HTMLView;

  beforeEach(() => {
    htmlView = createHTMLView();
  });

  it('initializes default values', () => {
    expect(htmlView.data.element).toBeNull();
    expect(htmlView.data.width).toBe(100);
    expect(htmlView.data.height).toBe(100);
    expect(htmlView.kind).toStrictEqual(HTMLViewKind);
  });

  it('allows pre-defined values', () => {
    const element = {} as HTMLImageElement;
    const base = {
      data: {
        element: element,
        width: 640,
        height: 480,
      },
    };
    const obj = createHTMLView(base);
    expect(obj.data.element).toStrictEqual(element);
    expect(obj.data.width).toBe(640);
    expect(obj.data.height).toBe(480);
  });

  it('returns a new object for better hidden-class performance', () => {
    const base = {};
    const obj = createHTMLView(base);
    expect(obj).not.toStrictEqual(base);
  });
});

describe('createHTMLViewData', () => {
  it('returns default values', () => {
    const data = createHTMLViewData();
    expect(data.element).toBeNull();
    expect(data.width).toBe(100);
    expect(data.height).toBe(100);
  });

  it('allows pre-defined values', () => {
    const element = {} as HTMLImageElement;
    const data = createHTMLViewData({ element, width: 200, height: 150 });
    expect(data.element).toBe(element);
    expect(data.width).toBe(200);
    expect(data.height).toBe(150);
  });
});

describe('createHTMLViewRuntime', () => {
  it('returns a non-null runtime', () => {
    const runtime = createHTMLViewRuntime();
    expect(runtime).not.toBeNull();
  });

  it('uses computeHTMLViewLocalBoundsRectangle', () => {
    const runtime = createHTMLViewRuntime();
    expect(runtime.computeLocalBoundsRectangle).toStrictEqual(computeHTMLViewLocalBoundsRectangle);
  });
});

describe('getHTMLViewRuntime', () => {
  it('returns the runtime for an HTMLView', () => {
    const htmlView = createHTMLView();
    const runtime = getHTMLViewRuntime(htmlView);
    expect(runtime).not.toBeNull();
  });
});

describe('setHTMLViewSize', () => {
  it('updates width and height', () => {
    const htmlView = createHTMLView();
    setHTMLViewSize(htmlView, 320, 240);
    expect(htmlView.data.width).toBe(320);
    expect(htmlView.data.height).toBe(240);
  });

  it('is a no-op when dimensions are unchanged', () => {
    const htmlView = createHTMLView({ data: { width: 200, height: 150 } });
    setHTMLViewSize(htmlView, 200, 150);
    expect(htmlView.data.width).toBe(200);
    expect(htmlView.data.height).toBe(150);
  });
});
