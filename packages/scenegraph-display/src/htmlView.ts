import { invalidateLocalBounds } from '@flighthq/scenegraph-core';
import type {
  GraphNode,
  HTMLView,
  HTMLViewData,
  HTMLViewRuntime,
  MethodsOf,
  PartialNode,
  Rectangle,
} from '@flighthq/types';
import { HTMLViewKind } from '@flighthq/types';

import { createDisplayObjectGeneric, createDisplayObjectRuntime, getDisplayObjectRuntime } from './displayObject';

export function computeHTMLViewLocalBoundsRectangle(out: Rectangle, source: Readonly<GraphNode>): void {
  const data = (source as HTMLView).data;
  out.width = data.width;
  out.height = data.height;
}

export function createHTMLView(obj?: Readonly<PartialNode<HTMLView>>): HTMLView {
  return createDisplayObjectGeneric(HTMLViewKind, obj, createHTMLViewData, createHTMLViewRuntime) as HTMLView;
}

export function createHTMLViewData(data?: Readonly<Partial<HTMLViewData>>): HTMLViewData {
  return {
    element: data?.element ?? null,
    height: data?.height ?? 100,
    width: data?.width ?? 100,
  };
}

export function createHTMLViewRuntime(): HTMLViewRuntime {
  return createDisplayObjectRuntime(defaultMethods) as HTMLViewRuntime;
}

export function getHTMLViewRuntime(source: Readonly<HTMLView>): Readonly<HTMLViewRuntime> {
  return getDisplayObjectRuntime(source) as HTMLViewRuntime;
}

export function setHTMLViewSize(source: HTMLView, width: number, height: number): void {
  if (source.data.width === width && source.data.height === height) return;
  source.data.width = width;
  source.data.height = height;
  invalidateLocalBounds(source);
}

const defaultMethods: Partial<MethodsOf<HTMLViewRuntime>> = {
  computeLocalBoundsRect: computeHTMLViewLocalBoundsRectangle,
};
