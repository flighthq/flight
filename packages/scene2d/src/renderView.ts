import { invalidateNodeLocalBounds } from '@flighthq/node';
import type {
  MethodsOf,
  Node,
  PartialNode,
  Rectangle,
  RenderView,
  RenderViewData,
  RenderViewRuntime,
} from '@flighthq/types';
import { RenderViewKind } from '@flighthq/types';

import { createNode2D, createNode2DRuntime, getNode2DRuntime } from './displayObject';

export function computeRenderViewLocalBoundsRectangle(out: Rectangle, source: Readonly<Node>): void {
  const data = (source as RenderView).data;
  out.width = data.width;
  out.height = data.height;
}

export function createRenderView(obj?: Readonly<PartialNode<RenderView>>): RenderView {
  return createNode2D(RenderViewKind, obj, createRenderViewData, createRenderViewRuntime) as RenderView;
}

export function createRenderViewData(data?: Readonly<Partial<RenderViewData>>): RenderViewData {
  return {
    height: data?.height ?? 0,
    renderer: data?.renderer ?? null,
    width: data?.width ?? 0,
  };
}

export function createRenderViewRuntime(): RenderViewRuntime {
  return createNode2DRuntime(defaultMethods) as RenderViewRuntime;
}

export function getRenderViewRuntime(source: Readonly<RenderView>): Readonly<RenderViewRuntime> {
  return getNode2DRuntime(source) as RenderViewRuntime;
}

export function setRenderViewSize(source: RenderView, width: number, height: number): void {
  if (source.data.width === width && source.data.height === height) return;
  source.data.width = width;
  source.data.height = height;
  invalidateNodeLocalBounds(source);
}

const defaultMethods: Partial<MethodsOf<RenderViewRuntime>> = {
  computeLocalBoundsRectangle: computeRenderViewLocalBoundsRectangle,
};
