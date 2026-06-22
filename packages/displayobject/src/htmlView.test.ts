import { createRectangle } from '@flighthq/geometry';
import type { HtmlView, Node } from '@flighthq/types';
import { HtmlViewKind } from '@flighthq/types';

import {
  computeHtmlViewLocalBoundsRectangle,
  createHtmlView,
  createHtmlViewData,
  createHtmlViewRuntime,
  getHtmlViewRuntime,
  setHtmlViewSize,
} from './htmlView';

describe('computeHtmlViewLocalBoundsRectangle', () => {
  it('sets out dimensions from data width and height', () => {
    const htmlView = createHtmlView({ data: { width: 320, height: 240 } });
    const out = createRectangle();
    computeHtmlViewLocalBoundsRectangle(out, htmlView as unknown as Node);
    expect(out.width).toBe(320);
    expect(out.height).toBe(240);
  });
});

describe('createHtmlView', () => {
  let htmlView: HtmlView;

  beforeEach(() => {
    htmlView = createHtmlView();
  });

  it('initializes default values', () => {
    expect(htmlView.data.element).toBeNull();
    expect(htmlView.data.width).toBe(100);
    expect(htmlView.data.height).toBe(100);
    expect(htmlView.kind).toStrictEqual(HtmlViewKind);
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
    const obj = createHtmlView(base);
    expect(obj.data.element).toStrictEqual(element);
    expect(obj.data.width).toBe(640);
    expect(obj.data.height).toBe(480);
  });

  it('returns a new object for better hidden-class performance', () => {
    const base = {};
    const obj = createHtmlView(base);
    expect(obj).not.toStrictEqual(base);
  });
});

describe('createHtmlViewData', () => {
  it('returns default values', () => {
    const data = createHtmlViewData();
    expect(data.element).toBeNull();
    expect(data.width).toBe(100);
    expect(data.height).toBe(100);
  });

  it('allows pre-defined values', () => {
    const element = {} as HTMLImageElement;
    const data = createHtmlViewData({ element, width: 200, height: 150 });
    expect(data.element).toBe(element);
    expect(data.width).toBe(200);
    expect(data.height).toBe(150);
  });
});

describe('createHtmlViewRuntime', () => {
  it('returns a non-null runtime', () => {
    const runtime = createHtmlViewRuntime();
    expect(runtime).not.toBeNull();
  });

  it('uses computeHtmlViewLocalBoundsRectangle', () => {
    const runtime = createHtmlViewRuntime();
    expect(runtime.computeLocalBoundsRectangle).toStrictEqual(computeHtmlViewLocalBoundsRectangle);
  });
});

describe('getHtmlViewRuntime', () => {
  it('returns the runtime for an HtmlView', () => {
    const htmlView = createHtmlView();
    const runtime = getHtmlViewRuntime(htmlView);
    expect(runtime).not.toBeNull();
  });
});

describe('setHtmlViewSize', () => {
  it('updates width and height', () => {
    const htmlView = createHtmlView();
    setHtmlViewSize(htmlView, 320, 240);
    expect(htmlView.data.width).toBe(320);
    expect(htmlView.data.height).toBe(240);
  });

  it('is a no-op when dimensions are unchanged', () => {
    const htmlView = createHtmlView({ data: { width: 200, height: 150 } });
    setHtmlViewSize(htmlView, 200, 150);
    expect(htmlView.data.width).toBe(200);
    expect(htmlView.data.height).toBe(150);
  });
});
