import type {
  GridLayoutContainerStyle,
  GridLayoutItemStyle,
  GridLayoutTrack,
  LayoutResolver,
  LayoutState,
  LayoutTree,
} from '@flighthq/types/contract';
import { GridLayoutKind, LayoutResolutionFailureKind } from '@flighthq/types/contract';

import { registerLayoutResolver } from './layoutState';

export function registerGridLayoutResolver(state: Readonly<LayoutState>): void {
  registerLayoutResolver(state, GridLayoutKind, gridLayoutResolver);
}

const gridLayoutResolver: LayoutResolver = (out, tree, intrinsicSizes, parentIndex, childIndex) => {
  const containerValue = tree.nodes[parentIndex].containerStyle;
  if (!isGridLayoutContainerStyle(containerValue)) return LayoutResolutionFailureKind.InvalidContainerStyle;
  const itemValue = tree.nodes[childIndex].itemStyle;
  if (!isGridLayoutItemStyle(itemValue)) return LayoutResolutionFailureKind.InvalidItemStyle;

  const container = containerValue as Readonly<GridLayoutContainerStyle>;
  const column = getGridColumn(tree, parentIndex, childIndex, container.columns.length);
  const row = getGridRow(tree, parentIndex, childIndex, container.columns.length);
  const item = itemValue as Readonly<GridLayoutItemStyle> | null;
  const columnSpan = item?.columnSpan ?? 1;
  const rowSpan = item?.rowSpan ?? 1;
  if (
    column < 0 ||
    row < 0 ||
    column + columnSpan > container.columns.length ||
    row + rowSpan > container.rows.length
  ) {
    return LayoutResolutionFailureKind.InvalidItemStyle;
  }

  const parentOffset = parentIndex * 4;
  const paddingLeft = container.paddingLeft ?? 0;
  const paddingRight = container.paddingRight ?? 0;
  const paddingTop = container.paddingTop ?? 0;
  const paddingBottom = container.paddingBottom ?? 0;
  const columnGap = container.columnGap ?? 0;
  const rowGap = container.rowGap ?? 0;
  const availableWidth = Math.max(0, out[parentOffset + 2] - paddingLeft - paddingRight);
  const availableHeight = Math.max(0, out[parentOffset + 3] - paddingTop - paddingBottom);
  const childOffset = childIndex * 4;

  let x = out[parentOffset] + paddingLeft;
  for (let i = 0; i < column; i++) {
    x += getGridTrackSize(tree, intrinsicSizes, parentIndex, container, true, i, availableWidth, columnGap);
    x += columnGap;
  }
  let width = columnGap * Math.max(0, columnSpan - 1);
  for (let i = column; i < column + columnSpan; i++) {
    width += getGridTrackSize(tree, intrinsicSizes, parentIndex, container, true, i, availableWidth, columnGap);
  }

  let y = out[parentOffset + 1] + paddingTop;
  for (let i = 0; i < row; i++) {
    y += getGridTrackSize(tree, intrinsicSizes, parentIndex, container, false, i, availableHeight, rowGap);
    y += rowGap;
  }
  let height = rowGap * Math.max(0, rowSpan - 1);
  for (let i = row; i < row + rowSpan; i++) {
    height += getGridTrackSize(tree, intrinsicSizes, parentIndex, container, false, i, availableHeight, rowGap);
  }

  out[childOffset] = x;
  out[childOffset + 1] = y;
  out[childOffset + 2] = width;
  out[childOffset + 3] = height;
  return null;
};

function getGridTrackSize(
  tree: Readonly<LayoutTree>,
  intrinsicSizes: ArrayLike<number>,
  parentIndex: number,
  container: Readonly<GridLayoutContainerStyle>,
  columns: boolean,
  trackIndex: number,
  availableSize: number,
  gap: number,
): number {
  const tracks = columns ? container.columns : container.rows;
  const track = tracks[trackIndex];
  if (track.kind === 'fixed') return track.size;
  if (track.kind === 'auto') {
    return getGridAutoTrackSize(tree, intrinsicSizes, parentIndex, container, columns, trackIndex);
  }

  let occupied = gap * Math.max(0, tracks.length - 1);
  let totalFraction = 0;
  for (let i = 0; i < tracks.length; i++) {
    const candidate = tracks[i];
    if (candidate.kind === 'fixed') occupied += candidate.size;
    else if (candidate.kind === 'auto') {
      occupied += getGridAutoTrackSize(tree, intrinsicSizes, parentIndex, container, columns, i);
    } else totalFraction += candidate.fraction;
  }
  return totalFraction === 0 ? 0 : (Math.max(0, availableSize - occupied) * track.fraction) / totalFraction;
}

function getGridAutoTrackSize(
  tree: Readonly<LayoutTree>,
  intrinsicSizes: ArrayLike<number>,
  parentIndex: number,
  container: Readonly<GridLayoutContainerStyle>,
  columns: boolean,
  trackIndex: number,
): number {
  const tracks = columns ? container.columns : container.rows;
  let size = 0;
  for (let i = 0; i < tree.nodes.length; i++) {
    const node = tree.nodes[i];
    if (node.parentIndex !== parentIndex || !isGridLayoutItemStyle(node.itemStyle)) continue;
    const item = node.itemStyle as Readonly<GridLayoutItemStyle> | null;
    const start = columns
      ? getGridColumn(tree, parentIndex, i, container.columns.length)
      : getGridRow(tree, parentIndex, i, container.columns.length);
    const span = columns ? (item?.columnSpan ?? 1) : (item?.rowSpan ?? 1);
    if (trackIndex < start || trackIndex >= start + span) continue;
    let autoTracksInSpan = 0;
    for (let j = start; j < start + span && j < tracks.length; j++) {
      if (tracks[j].kind === 'auto') autoTracksInSpan++;
    }
    if (autoTracksInSpan > 0) {
      let remainingIntrinsic = finiteSize(intrinsicSizes[i * 2 + (columns ? 0 : 1)]);
      const gap = columns ? (container.columnGap ?? 0) : (container.rowGap ?? 0);
      remainingIntrinsic -= gap * Math.max(0, span - 1);
      for (let j = start; j < start + span && j < tracks.length; j++) {
        const candidate = tracks[j];
        if (candidate.kind === 'fixed') remainingIntrinsic -= candidate.size;
      }
      size = Math.max(size, Math.max(0, remainingIntrinsic) / autoTracksInSpan);
    }
  }
  return size;
}

function getGridColumn(
  tree: Readonly<LayoutTree>,
  parentIndex: number,
  childIndex: number,
  columnCount: number,
): number {
  const item = tree.nodes[childIndex].itemStyle as Readonly<GridLayoutItemStyle> | null;
  if (item?.column !== undefined) return item.column;
  return getGridOrdinal(tree, parentIndex, childIndex) % columnCount;
}

function getGridRow(tree: Readonly<LayoutTree>, parentIndex: number, childIndex: number, columnCount: number): number {
  const item = tree.nodes[childIndex].itemStyle as Readonly<GridLayoutItemStyle> | null;
  if (item?.row !== undefined) return item.row;
  return Math.floor(getGridOrdinal(tree, parentIndex, childIndex) / columnCount);
}

function getGridOrdinal(tree: Readonly<LayoutTree>, parentIndex: number, childIndex: number): number {
  let ordinal = 0;
  for (let i = 0; i < childIndex; i++) if (tree.nodes[i].parentIndex === parentIndex) ordinal++;
  return ordinal;
}

function isGridLayoutContainerStyle(value: object | null): boolean {
  if (value === null) return false;
  const style = value as Partial<GridLayoutContainerStyle>;
  return (
    isTrackList(style.columns) &&
    isTrackList(style.rows) &&
    isNonNegativeOptionalNumber(style.columnGap) &&
    isNonNegativeOptionalNumber(style.paddingBottom) &&
    isNonNegativeOptionalNumber(style.paddingLeft) &&
    isNonNegativeOptionalNumber(style.paddingRight) &&
    isNonNegativeOptionalNumber(style.paddingTop) &&
    isNonNegativeOptionalNumber(style.rowGap)
  );
}

function isTrackList(value: unknown): value is readonly GridLayoutTrack[] {
  if (!Array.isArray(value) || value.length === 0) return false;
  for (const track of value) {
    if (typeof track !== 'object' || track === null) return false;
    const candidate = track as Partial<GridLayoutTrack>;
    if (candidate.kind === 'auto') continue;
    if (candidate.kind === 'fixed' && isNonNegativeNumber(candidate.size)) continue;
    if (candidate.kind === 'fraction' && isPositiveNumber(candidate.fraction)) continue;
    return false;
  }
  return true;
}

function isGridLayoutItemStyle(value: object | null): boolean {
  if (value === null) return true;
  const style = value as Partial<GridLayoutItemStyle>;
  const hasColumn = style.column !== undefined;
  const hasRow = style.row !== undefined;
  return (
    hasColumn === hasRow &&
    isNonNegativeOptionalInteger(style.column) &&
    isPositiveOptionalInteger(style.columnSpan) &&
    isNonNegativeOptionalInteger(style.row) &&
    isPositiveOptionalInteger(style.rowSpan)
  );
}

function isNonNegativeOptionalNumber(value: unknown): value is number | undefined {
  return value === undefined || isNonNegativeNumber(value);
}

function isNonNegativeNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0;
}

function isPositiveNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0;
}

function isNonNegativeOptionalInteger(value: unknown): value is number | undefined {
  return value === undefined || (Number.isInteger(value) && (value as number) >= 0);
}

function isPositiveOptionalInteger(value: unknown): value is number | undefined {
  return value === undefined || (Number.isInteger(value) && (value as number) > 0);
}

function finiteSize(value: number): number {
  return Number.isFinite(value) && value > 0 ? value : 0;
}
