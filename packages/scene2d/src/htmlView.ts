import { allocateEntity, finishEntity } from '@flighthq/entity/contract';
import { invalidateNodeLocalBounds } from '@flighthq/node/contract';
import type {
  EntityConstruction,
  HtmlView,
  HtmlViewData,
  HtmlViewRuntime,
  MethodsOf,
  Node,
  PartialNode,
  Rectangle,
} from '@flighthq/types/contract';
import { HtmlViewKind } from '@flighthq/types/contract';

import { createNode2D, createNode2DRuntime, getNode2DRuntime } from './displayObject';

export function computeHtmlViewLocalBoundsRectangle(out: Rectangle, source: Readonly<Node>): void {
  const data = (source as HtmlView).data;
  out.width = data.width;
  out.height = data.height;
}

export function createHtmlView(obj?: Readonly<PartialNode<HtmlView>>): HtmlView {
  return createNode2D(HtmlViewKind, obj, createHtmlViewData, createHtmlViewRuntime) as HtmlView;
}

export function createHtmlViewData(data?: Readonly<Partial<HtmlViewData>>): HtmlViewData {
  const out = allocateEntity<HtmlViewData>();
  out.element = data?.element ?? null;
  out.height = data?.height ?? 100;
  out.width = data?.width ?? 100;
  return finishEntity(out);
}

export function createHtmlViewRuntime(): HtmlViewRuntime {
  return createNode2DRuntime(defaultMethods) as HtmlViewRuntime;
}

export function getHtmlViewRuntime(source: Readonly<HtmlView>): Readonly<HtmlViewRuntime> {
  return getNode2DRuntime(source) as HtmlViewRuntime;
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
