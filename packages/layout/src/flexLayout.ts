import type {
  FlexLayoutAlign,
  FlexLayoutContainerStyle,
  FlexLayoutDirection,
  FlexLayoutItemStyle,
  FlexLayoutJustify,
  FlexLayoutWrap,
  LayoutNode,
  LayoutResolver,
  LayoutState,
  LayoutTree,
} from '@flighthq/types/contract';
import { FlexLayoutKind, LayoutResolutionFailureKind } from '@flighthq/types/contract';

import { registerLayoutResolver } from './layoutState';

export function registerFlexLayoutResolver(state: Readonly<LayoutState>): void {
  registerLayoutResolver(state, FlexLayoutKind, flexLayoutResolver);
}

const flexLayoutResolver: LayoutResolver = (out, tree, intrinsicSizes, parentIndex, childIndex) => {
  const containerValue = tree.nodes[parentIndex].containerStyle;
  if (!isFlexLayoutContainerStyle(containerValue)) return LayoutResolutionFailureKind.InvalidContainerStyle;
  const itemValue = tree.nodes[childIndex].itemStyle;
  if (!isFlexLayoutItemStyle(itemValue)) return LayoutResolutionFailureKind.InvalidItemStyle;

  const container = containerValue as Readonly<FlexLayoutContainerStyle> | null;
  const direction = container?.direction ?? 'row';
  const wrap = container?.wrap ?? 'nowrap';
  const row = direction === 'row' || direction === 'row-reverse';
  const reverse = direction === 'row-reverse' || direction === 'column-reverse';
  const gap = container?.gap ?? 0;
  const paddingLeft = container?.paddingLeft ?? 0;
  const paddingRight = container?.paddingRight ?? 0;
  const paddingTop = container?.paddingTop ?? 0;
  const paddingBottom = container?.paddingBottom ?? 0;
  const parentOffset = parentIndex * 4;
  const mainStart = out[parentOffset + (row ? 0 : 1)] + (row ? paddingLeft : paddingTop);
  const crossStart = out[parentOffset + (row ? 1 : 0)] + (row ? paddingTop : paddingLeft);
  const mainSize = Math.max(
    0,
    out[parentOffset + (row ? 2 : 3)] - (row ? paddingLeft + paddingRight : paddingTop + paddingBottom),
  );
  const crossSize = Math.max(
    0,
    out[parentOffset + (row ? 3 : 2)] - (row ? paddingTop + paddingBottom : paddingLeft + paddingRight),
  );

  let lineStartIndex = -1;
  let lineLastIndex = -1;
  let lineCount = 0;
  let lineBaseSum = 0;
  let lineGrowSum = 0;
  let lineShrinkWeight = 0;
  let lineCross = 0;
  let lineUsedForWrap = 0;
  let crossOffset = 0;
  let containsTarget = false;
  const nodes = tree.nodes;

  for (let i = 0; i < nodes.length; i++) {
    if (nodes[i].parentIndex !== parentIndex) continue;
    const base = getFlexBase(nodes[i], intrinsicSizes, i, row);
    if (wrap !== 'nowrap' && lineCount > 0 && lineUsedForWrap + gap + base > mainSize) {
      if (containsTarget) break;
      crossOffset += lineCross + gap;
      lineStartIndex = -1;
      lineLastIndex = -1;
      lineCount = 0;
      lineBaseSum = 0;
      lineGrowSum = 0;
      lineShrinkWeight = 0;
      lineCross = 0;
      lineUsedForWrap = 0;
    }
    if (lineStartIndex < 0) lineStartIndex = i;
    lineLastIndex = i;
    const item = nodes[i].itemStyle as Readonly<FlexLayoutItemStyle> | null;
    const grow = item?.grow ?? 0;
    const shrink = item?.shrink ?? 1;
    lineBaseSum += base;
    lineGrowSum += grow;
    lineShrinkWeight += shrink * base;
    lineCross = Math.max(lineCross, getFlexCross(intrinsicSizes, i, row));
    lineUsedForWrap += (lineCount === 0 ? 0 : gap) + base;
    lineCount++;
    if (i === childIndex) containsTarget = true;
  }

  if (!containsTarget) return LayoutResolutionFailureKind.InvalidItemStyle;
  if (wrap === 'nowrap') lineCross = crossSize;
  if (wrap === 'wrap-reverse') {
    const totalCross = getFlexLinesCrossSize(tree, intrinsicSizes, parentIndex, row, mainSize, gap);
    crossOffset = crossSize - totalCross + crossOffset;
  }

  const distributable = mainSize - lineBaseSum - gap * Math.max(0, lineCount - 1);
  let usedMain = gap * Math.max(0, lineCount - 1);
  let targetMainSize = 0;
  let beforeTarget = 0;
  for (let i = lineStartIndex; i <= lineLastIndex; i++) {
    const node = nodes[i];
    if (node.parentIndex !== parentIndex) continue;
    const item = node.itemStyle as Readonly<FlexLayoutItemStyle> | null;
    const base = getFlexBase(node, intrinsicSizes, i, row);
    const itemMainSize = getFlexItemMainSize(
      base,
      item?.grow ?? 0,
      item?.shrink ?? 1,
      distributable,
      lineGrowSum,
      lineShrinkWeight,
    );
    if (i === childIndex) targetMainSize = itemMainSize;
    else if (i < childIndex) beforeTarget += itemMainSize + gap;
    usedMain += itemMainSize;
  }

  const freeMain = Math.max(0, mainSize - usedMain);
  const justify = container?.justify ?? 'start';
  const justifyGap = getFlexJustifyGap(justify, freeMain, lineCount);
  const justifyOffset = getFlexJustifyOffset(justify, freeMain, justifyGap);
  const targetOrdinal = countFlexSiblings(tree, parentIndex, lineStartIndex, childIndex);
  beforeTarget += justifyGap * targetOrdinal;
  const targetMain = reverse
    ? mainStart + mainSize - justifyOffset - beforeTarget - targetMainSize
    : mainStart + justifyOffset + beforeTarget;

  const item = itemValue as Readonly<FlexLayoutItemStyle> | null;
  const align =
    item?.alignSelf === undefined || item.alignSelf === 'auto' ? (container?.align ?? 'stretch') : item.alignSelf;
  let targetCrossSize = getFlexCross(intrinsicSizes, childIndex, row);
  if (align === 'stretch') targetCrossSize = lineCross;
  const targetCross = crossStart + crossOffset + getFlexAlignOffset(align, lineCross, targetCrossSize);
  const childOffset = childIndex * 4;
  out[childOffset] = row ? targetMain : targetCross;
  out[childOffset + 1] = row ? targetCross : targetMain;
  out[childOffset + 2] = row ? targetMainSize : targetCrossSize;
  out[childOffset + 3] = row ? targetCrossSize : targetMainSize;
  return null;
};

function getFlexLinesCrossSize(
  tree: Readonly<LayoutTree>,
  intrinsicSizes: ArrayLike<number>,
  parentIndex: number,
  row: boolean,
  mainSize: number,
  gap: number,
): number {
  let lineCount = 0;
  let lineUsed = 0;
  let lineCross = 0;
  let total = 0;
  for (let i = 0; i < tree.nodes.length; i++) {
    const node = tree.nodes[i];
    if (node.parentIndex !== parentIndex) continue;
    const base = getFlexBase(node, intrinsicSizes, i, row);
    if (lineCount > 0 && lineUsed + gap + base > mainSize) {
      total += lineCross + (total === 0 ? 0 : gap);
      lineCount = 0;
      lineUsed = 0;
      lineCross = 0;
    }
    lineUsed += (lineCount === 0 ? 0 : gap) + base;
    lineCross = Math.max(lineCross, getFlexCross(intrinsicSizes, i, row));
    lineCount++;
  }
  if (lineCount > 0) total += lineCross + (total === 0 ? 0 : gap);
  return total;
}

function getFlexBase(
  node: Readonly<LayoutNode>,
  intrinsicSizes: ArrayLike<number>,
  nodeIndex: number,
  row: boolean,
): number {
  const item = node.itemStyle as Readonly<FlexLayoutItemStyle> | null;
  const basis = item?.basis ?? 'auto';
  return basis === 'auto' ? finiteSize(intrinsicSizes[nodeIndex * 2 + (row ? 0 : 1)]) : basis;
}

function getFlexCross(intrinsicSizes: ArrayLike<number>, nodeIndex: number, row: boolean): number {
  return finiteSize(intrinsicSizes[nodeIndex * 2 + (row ? 1 : 0)]);
}

function getFlexItemMainSize(
  base: number,
  grow: number,
  shrink: number,
  distributable: number,
  growSum: number,
  shrinkWeight: number,
): number {
  if (distributable > 0 && growSum > 0) return base + (distributable * grow) / growSum;
  if (distributable < 0 && shrinkWeight > 0) {
    return Math.max(0, base + (distributable * shrink * base) / shrinkWeight);
  }
  return base;
}

function countFlexSiblings(
  tree: Readonly<LayoutTree>,
  parentIndex: number,
  startIndex: number,
  endIndex: number,
): number {
  let count = 0;
  for (let i = startIndex; i < endIndex; i++) if (tree.nodes[i].parentIndex === parentIndex) count++;
  return count;
}

function getFlexJustifyGap(justify: FlexLayoutJustify, free: number, count: number): number {
  if (justify === 'space-between') return count > 1 ? free / (count - 1) : 0;
  if (justify === 'space-around') return count > 0 ? free / count : 0;
  if (justify === 'space-evenly') return free / (count + 1);
  return 0;
}

function getFlexJustifyOffset(justify: FlexLayoutJustify, free: number, distributedGap: number): number {
  if (justify === 'end') return free;
  if (justify === 'center') return free / 2;
  if (justify === 'space-around') return distributedGap / 2;
  if (justify === 'space-evenly') return distributedGap;
  return 0;
}

function getFlexAlignOffset(align: FlexLayoutAlign, available: number, size: number): number {
  if (align === 'end') return available - size;
  if (align === 'center') return (available - size) / 2;
  return 0;
}

function isFlexLayoutContainerStyle(value: object | null): boolean {
  if (value === null) return true;
  const style = value as Partial<FlexLayoutContainerStyle>;
  return (
    isFlexAlign(style.align) &&
    isFlexDirection(style.direction) &&
    isNonNegativeOptionalNumber(style.gap) &&
    isFlexJustify(style.justify) &&
    isNonNegativeOptionalNumber(style.paddingBottom) &&
    isNonNegativeOptionalNumber(style.paddingLeft) &&
    isNonNegativeOptionalNumber(style.paddingRight) &&
    isNonNegativeOptionalNumber(style.paddingTop) &&
    isFlexWrap(style.wrap)
  );
}

function isFlexLayoutItemStyle(value: object | null): boolean {
  if (value === null) return true;
  const style = value as Partial<FlexLayoutItemStyle>;
  return (
    (style.alignSelf === undefined || style.alignSelf === 'auto' || isFlexAlign(style.alignSelf)) &&
    (style.basis === undefined || style.basis === 'auto' || isNonNegativeNumber(style.basis)) &&
    isNonNegativeOptionalNumber(style.grow) &&
    isNonNegativeOptionalNumber(style.shrink)
  );
}

function isFlexAlign(value: unknown): value is FlexLayoutAlign | undefined {
  return value === undefined || value === 'center' || value === 'end' || value === 'start' || value === 'stretch';
}

function isFlexDirection(value: unknown): value is FlexLayoutDirection | undefined {
  return (
    value === undefined ||
    value === 'column' ||
    value === 'column-reverse' ||
    value === 'row' ||
    value === 'row-reverse'
  );
}

function isFlexJustify(value: unknown): value is FlexLayoutJustify | undefined {
  return (
    value === undefined ||
    value === 'center' ||
    value === 'end' ||
    value === 'space-around' ||
    value === 'space-between' ||
    value === 'space-evenly' ||
    value === 'start'
  );
}

function isFlexWrap(value: unknown): value is FlexLayoutWrap | undefined {
  return value === undefined || value === 'nowrap' || value === 'wrap' || value === 'wrap-reverse';
}

function isNonNegativeOptionalNumber(value: unknown): value is number | undefined {
  return value === undefined || isNonNegativeNumber(value);
}

function isNonNegativeNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0;
}

function finiteSize(value: number): number {
  return Number.isFinite(value) && value > 0 ? value : 0;
}
