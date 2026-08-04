import type { AnchorLayoutItemStyle, LayoutResolver, LayoutState, ViewportAlign } from '@flighthq/types/contract';
import { AnchorLayoutKind, LayoutResolutionFailureKind } from '@flighthq/types/contract';

import { registerLayoutResolver } from './layoutState';

export function registerAnchorLayoutResolver(state: Readonly<LayoutState>): void {
  registerLayoutResolver(state, AnchorLayoutKind, anchorLayoutResolver);
}

const anchorLayoutResolver: LayoutResolver = (out, tree, intrinsicSizes, parentIndex, childIndex) => {
  const parentStyle = tree.nodes[parentIndex].containerStyle;
  if (!isEmptyStyle(parentStyle)) return LayoutResolutionFailureKind.InvalidContainerStyle;
  const itemStyle = tree.nodes[childIndex].itemStyle;
  if (!isAnchorLayoutItemStyle(itemStyle)) return LayoutResolutionFailureKind.InvalidItemStyle;
  const style = itemStyle as Readonly<AnchorLayoutItemStyle> | null;
  const parentOffset = parentIndex * 4;
  const parentX = out[parentOffset];
  const parentY = out[parentOffset + 1];
  const parentWidth = out[parentOffset + 2];
  const parentHeight = out[parentOffset + 3];
  const left = style?.left ?? null;
  const right = style?.right ?? null;
  const top = style?.top ?? null;
  const bottom = style?.bottom ?? null;
  const intrinsicOffset = childIndex * 2;
  const width =
    left !== null && right !== null
      ? Math.max(0, parentWidth - left - right)
      : finiteSize(style?.width ?? intrinsicSizes[intrinsicOffset]);
  const height =
    top !== null && bottom !== null
      ? Math.max(0, parentHeight - top - bottom)
      : finiteSize(style?.height ?? intrinsicSizes[intrinsicOffset + 1]);
  const align = style?.align ?? 'topleft';
  const childOffset = childIndex * 4;
  out[childOffset] =
    left !== null
      ? parentX + left
      : right !== null
        ? parentX + parentWidth - right - width
        : parentX + alignX(parentWidth, width, align);
  out[childOffset + 1] =
    top !== null
      ? parentY + top
      : bottom !== null
        ? parentY + parentHeight - bottom - height
        : parentY + alignY(parentHeight, height, align);
  out[childOffset + 2] = width;
  out[childOffset + 3] = height;
  return null;
};

function isEmptyStyle(value: object | null): boolean {
  if (value === null) return true;
  for (const _key in value) return false;
  return true;
}

function isAnchorLayoutItemStyle(value: object | null): boolean {
  if (value === null) return true;
  const style = value as Partial<AnchorLayoutItemStyle>;
  return (
    isAlign(style.align) &&
    isOptionalNumber(style.bottom) &&
    isOptionalNumber(style.height) &&
    isOptionalNumber(style.left) &&
    isOptionalNumber(style.right) &&
    isOptionalNumber(style.top) &&
    isOptionalNumber(style.width)
  );
}

function isAlign(value: unknown): value is ViewportAlign | undefined {
  return (
    value === undefined ||
    value === 'bottom' ||
    value === 'bottomleft' ||
    value === 'bottomright' ||
    value === 'left' ||
    value === 'right' ||
    value === 'top' ||
    value === 'topleft' ||
    value === 'topright'
  );
}

function isOptionalNumber(value: unknown): value is number | null | undefined {
  return value === undefined || value === null || (typeof value === 'number' && Number.isFinite(value));
}

function finiteSize(value: number): number {
  return Number.isFinite(value) && value > 0 ? value : 0;
}

function alignX(parentWidth: number, childWidth: number, align: ViewportAlign): number {
  if (align === 'left' || align === 'topleft' || align === 'bottomleft') return 0;
  if (align === 'right' || align === 'topright' || align === 'bottomright') return parentWidth - childWidth;
  return (parentWidth - childWidth) / 2;
}

function alignY(parentHeight: number, childHeight: number, align: ViewportAlign): number {
  if (align === 'top' || align === 'topleft' || align === 'topright') return 0;
  if (align === 'bottom' || align === 'bottomleft' || align === 'bottomright') return parentHeight - childHeight;
  return (parentHeight - childHeight) / 2;
}
