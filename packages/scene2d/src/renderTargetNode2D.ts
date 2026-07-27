import { invalidateNodeLocalBounds } from '@flighthq/node/contract';
import type {
  MethodsOf,
  Node,
  Rectangle,
  RenderTargetNode2D,
  RenderTargetNode2DData,
  RenderTargetNode2DOptions,
  RenderTargetNode2DRuntime,
} from '@flighthq/types/contract';
import { RenderTargetNode2DKind } from '@flighthq/types/contract';

import { createNode2D, createNode2DRuntime, getNode2DRuntime } from './displayObject';

export function computeRenderTargetNode2DLocalBoundsRectangle(out: Rectangle, source: Readonly<Node>): void {
  const data = (source as RenderTargetNode2D).data;
  out.width = data.width;
  out.height = data.height;
}

export function createRenderTargetNode2D(options: Readonly<RenderTargetNode2DOptions>): RenderTargetNode2D {
  return createNode2D(
    RenderTargetNode2DKind,
    { data: options },
    createRenderTargetNode2DData,
    createRenderTargetNode2DRuntime,
  ) as RenderTargetNode2D;
}

export function createRenderTargetNode2DData(data?: Readonly<Partial<RenderTargetNode2DData>>): RenderTargetNode2DData {
  return {
    depth: data?.depth ?? false,
    height: data?.height ?? 0,
    width: data?.width ?? 0,
  };
}

export function createRenderTargetNode2DRuntime(): RenderTargetNode2DRuntime {
  return createNode2DRuntime(defaultMethods) as RenderTargetNode2DRuntime;
}

export function getRenderTargetNode2DRuntime(
  source: Readonly<RenderTargetNode2D>,
): Readonly<RenderTargetNode2DRuntime> {
  return getNode2DRuntime(source) as RenderTargetNode2DRuntime;
}

export function setRenderTargetNode2DSize(source: RenderTargetNode2D, width: number, height: number): void {
  if (source.data.width === width && source.data.height === height) return;
  source.data.width = width;
  source.data.height = height;
  invalidateNodeLocalBounds(source);
}

const defaultMethods: Partial<MethodsOf<RenderTargetNode2DRuntime>> = {
  computeLocalBoundsRectangle: computeRenderTargetNode2DLocalBoundsRectangle,
};
