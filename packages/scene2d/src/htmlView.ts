import { allocateEntity, finishEntity } from '@flighthq/entity/contract';
import { invalidateNodeLocalBounds } from '@flighthq/node/contract';
import type {
  BoundsNode,
  EntityConstruction,
  HtmlView,
  HtmlViewData,
  HtmlViewRuntime,
  MethodsOf,
  Node2DFields,
  Rectangle,
} from '@flighthq/types/contract';
import { HtmlViewKind } from '@flighthq/types/contract';

import { createNode2D, createNode2DRuntime, getNode2DRuntime } from './displayObject.ts';

export function computeHtmlViewLocalBoundsRectangle(out: Rectangle, source: Readonly<BoundsNode<Node2DFields>>): void {
  const data = (source as HtmlView).data;
  out.width = data.width;
  out.height = data.height;
}

export function createHtmlView(): HtmlView {
  return createNode2D(HtmlViewKind, createHtmlViewData, createHtmlViewRuntime) as HtmlView;
}

export function createHtmlViewData(): HtmlViewData {
  const out = allocateEntity<HtmlViewData>();
  initializeHtmlViewData(out);
  return finishEntity(out);
}

export function createHtmlViewRuntime(): HtmlViewRuntime {
  return createNode2DRuntime(defaultMethods) as HtmlViewRuntime;
}

export function getHtmlViewRuntime(source: Readonly<HtmlView>): Readonly<HtmlViewRuntime> {
  return getNode2DRuntime(source) as HtmlViewRuntime;
}

export function initializeHtmlViewData(out: EntityConstruction<HtmlViewData>): void {
  out.element = null;
  out.height = 100;
  out.width = 100;
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
