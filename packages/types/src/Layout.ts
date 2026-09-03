import type { Entity } from './Entity';
import type { ViewportAlign } from './ViewportAlign';

export const AnchorLayoutKind = 'AnchorLayout';
export const FlexLayoutKind = 'FlexLayout';
export const GridLayoutKind = 'GridLayout';

// A child of an anchor container keeps its natural size unless width/height override it or opposing
// edge pins stretch it. With no pin on an axis, the existing viewport alignment vocabulary positions it.
export interface AnchorLayoutItemStyle {
  align?: ViewportAlign;
  bottom?: number | null;
  height?: number | null;
  left?: number | null;
  right?: number | null;
  top?: number | null;
  width?: number | null;
}

export type FlexLayoutAlign = 'center' | 'end' | 'start' | 'stretch';
export type FlexLayoutDirection = 'column' | 'column-reverse' | 'row' | 'row-reverse';
export type FlexLayoutJustify = 'center' | 'end' | 'space-around' | 'space-between' | 'space-evenly' | 'start';
export type FlexLayoutWrap = 'nowrap' | 'wrap' | 'wrap-reverse';

export interface FlexLayoutContainerStyle {
  align?: FlexLayoutAlign;
  direction?: FlexLayoutDirection;
  gap?: number;
  justify?: FlexLayoutJustify;
  paddingBottom?: number;
  paddingLeft?: number;
  paddingRight?: number;
  paddingTop?: number;
  wrap?: FlexLayoutWrap;
}

export interface FlexLayoutItemStyle {
  alignSelf?: FlexLayoutAlign | 'auto';
  basis?: number | 'auto';
  grow?: number;
  shrink?: number;
}

export type GridLayoutTrack =
  | { kind: 'auto' }
  | { kind: 'fixed'; size: number }
  | { fraction: number; kind: 'fraction' };

export interface GridLayoutContainerStyle {
  columnGap?: number;
  columns: readonly GridLayoutTrack[];
  paddingBottom?: number;
  paddingLeft?: number;
  paddingRight?: number;
  paddingTop?: number;
  rowGap?: number;
  rows: readonly GridLayoutTrack[];
}

// Columns and rows are zero-based. Omitted placement is assigned row-major among the parent's children;
// omitted spans are one track.
export interface GridLayoutItemStyle {
  column?: number;
  columnSpan?: number;
  row?: number;
  rowSpan?: number;
}

// One node has two independent roles. `kind` and `containerStyle` describe how it arranges its own
// children; `itemStyle` is interpreted by its parent's resolver. A root uses parentIndex -1. All other
// parents precede their children so resolution is one forward propagation pass.
export interface LayoutNode<ContainerStyle extends object = object, ItemStyle extends object = object> {
  containerStyle: ContainerStyle | null;
  itemStyle: ItemStyle | null;
  kind: string;
  parentIndex: number;
}

export interface LayoutTree {
  nodes: readonly LayoutNode[];
}

export const LayoutResolutionFailureKind = {
  IntrinsicSizesTooSmall: 'IntrinsicSizesTooSmall',
  InvalidContainerStyle: 'InvalidContainerStyle',
  InvalidHierarchy: 'InvalidHierarchy',
  InvalidItemStyle: 'InvalidItemStyle',
  OutputTooSmall: 'OutputTooSmall',
  UnregisteredKind: 'UnregisteredKind',
} as const;

export type LayoutResolutionFailureKind =
  (typeof LayoutResolutionFailureKind)[keyof typeof LayoutResolutionFailureKind];

export interface LayoutResolutionExplanation {
  actualLength: number;
  kind: LayoutResolutionFailureKind;
  nodeIndex: number;
  parentIndex: number;
  requiredLength: number;
  resolverKind: string | null;
}

// A resolver writes one child's absolute x/y/width/height rectangle into `out`. The core calls it once
// per non-root node in parent-before-child order. Returning null means success; a failure kind is the
// allocation-free sentinel for an expected rejection such as a mismatched item style.
export type LayoutResolver = (
  out: Float32Array,
  tree: Readonly<LayoutTree>,
  intrinsicSizes: ArrayLike<number>,
  parentIndex: number,
  childIndex: number,
) => LayoutResolutionFailureKind | null;

export type LayoutResolutionGuard = (explanation: Readonly<LayoutResolutionExplanation>) => void;

export interface LayoutState extends Entity {
  guard: LayoutResolutionGuard | null;
  lastFailureActualLength: number;
  lastFailureKind: LayoutResolutionFailureKind | null;
  lastFailureNodeIndex: number;
  lastFailureParentIndex: number;
  lastFailureRequiredLength: number;
  lastFailureResolverKind: string | null;
  resolvers: Map<string, LayoutResolver>;
}
