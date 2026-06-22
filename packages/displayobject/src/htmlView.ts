import { invalidateNodeLocalBounds } from '@flighthq/node';
import type { HtmlView, HtmlViewData, HtmlViewRuntime, MethodsOf, Node, PartialNode, Rectangle } from '@flighthq/types';
import { HtmlViewKind } from '@flighthq/types';

import { createDisplayObjectGeneric, createDisplayObjectRuntime, getDisplayObjectRuntime } from './displayObject';

export function computeHtmlViewLocalBoundsRectangle(out: Rectangle, source: Readonly<Node>): void {
  const data = (source as HtmlView).data;
  out.width = data.width;
  out.height = data.height;
}

export function createHtmlView(obj?: Readonly<PartialNode<HtmlView>>): HtmlView {
  return createDisplayObjectGeneric(HtmlViewKind, obj, createHtmlViewData, createHtmlViewRuntime) as HtmlView;
}

export function createHtmlViewData(data?: Readonly<Partial<HtmlViewData>>): HtmlViewData {
  return {
    element: data?.element ?? null,
    height: data?.height ?? 100,
    width: data?.width ?? 100,
  };
}

export function createHtmlViewRuntime(): HtmlViewRuntime {
  return createDisplayObjectRuntime(defaultMethods) as HtmlViewRuntime;
}

export function getHtmlViewRuntime(source: Readonly<HtmlView>): Readonly<HtmlViewRuntime> {
  return getDisplayObjectRuntime(source) as HtmlViewRuntime;
}

export function setHtmlViewSize(source: HtmlView, width: number, height: number): void {
  if (source.data.width === width && source.data.height === height) return;
  source.data.width = width;
  source.data.height = height;
  invalidateNodeLocalBounds(source);
}

const defaultMethods: Partial<MethodsOf<HtmlViewRuntime>> = {
  computeLocalBoundsRectangle: computeHtmlViewLocalBoundsRectangle,
};
