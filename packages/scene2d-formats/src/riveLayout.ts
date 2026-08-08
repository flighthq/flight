import { reportImportDiagnostic } from '@flighthq/importdiagnostics/contract';
import type {
  DisplayObject,
  FlexLayoutAlign,
  FlexLayoutContainerStyle,
  FlexLayoutDirection,
  FlexLayoutItemStyle,
  FlexLayoutJustify,
  GridLayoutContainerStyle,
  GridLayoutItemStyle,
  GridLayoutTrack,
  ImportDiagnostic,
  LayoutNode,
  RiveArtboardGraph,
  RiveCoreObject,
  RiveLayoutImport,
} from '@flighthq/types/contract';
import { FlexLayoutKind, GridLayoutKind, ImportDiagnosticSeverity } from '@flighthq/types/contract';

import { isRiveCoreTypeDerivedFrom } from './riveCoreTypes';

interface RiveLayoutProvider {
  sourceIndex: number;
  styleIndex: number;
  targetIndex: number;
  type: 'component' | 'nested' | 'participant';
}

interface RiveLayoutContext {
  childCount: number;
  layoutType: number;
  row: boolean;
  rtl: boolean;
  sourceIndex: number;
  style: Readonly<RiveCoreObject>;
}

interface RiveSizingValues {
  fractionalHeight: number;
  fractionalWidth: number;
  height: number;
  heightScale: number;
  heightUnits: number;
  width: number;
  widthScale: number;
  widthUnits: number;
}

type RiveAxisAlignment = 'center' | 'end' | 'start';

/**
 * Translates each independent Rive layout root into the flat descriptors consumed by
 * `@flighthq/layout`.
 *
 * Rive's own runtime deliberately has separate `applyContainerStyle` and `applyItemStyle` passes.
 * This importer keeps the same boundary: every LayoutComponent's own style becomes its
 * `containerStyle`, while its sizing fields become the `itemStyle` interpreted by the descriptor's
 * parent. LayoutParticipant is attached to its parent display node rather than emitted as a phantom
 * target. Natural sizes remain absent by design; `RiveLayoutImport.targets` tells the caller what to
 * measure for the intrinsic-size buffer.
 */
export function createRiveLayoutImports(
  artboard: Readonly<RiveArtboardGraph>,
  nodes: ReadonlyArray<DisplayObject | null>,
  diagnostics?: ImportDiagnostic[],
): RiveLayoutImport[] {
  const componentProviders = findRiveLayoutComponents(artboard, nodes, diagnostics);
  if (componentProviders.size === 0) return [];

  const providers = new Map<number, RiveLayoutProvider>(componentProviders);
  const placements = new Map<number, Readonly<RiveCoreObject>>();
  for (let index = 1; index < artboard.objects.length; index++) {
    const object = artboard.objects[index];
    if (isRiveCoreTypeDerivedFrom(object.typeKey, RIVE_LAYOUT_PARTICIPANT_TYPE_KEY)) {
      const targetIndex = artboard.parentIndices[index];
      if (targetIndex > 0 && nodes[targetIndex] !== null && nodes[targetIndex] !== undefined) {
        providers.set(targetIndex, { sourceIndex: targetIndex, styleIndex: index, targetIndex, type: 'participant' });
      }
      continue;
    }
    if (isRiveCoreTypeDerivedFrom(object.typeKey, RIVE_NESTED_ARTBOARD_LAYOUT_TYPE_KEY)) {
      if (nodes[index] !== null && nodes[index] !== undefined) {
        providers.set(index, { sourceIndex: index, styleIndex: index, targetIndex: index, type: 'nested' });
      }
      continue;
    }
    if (isRiveCoreTypeDerivedFrom(object.typeKey, RIVE_GRID_ITEM_PLACEMENT_TYPE_KEY)) {
      const owner = artboard.parentIndices[index];
      if (owner >= 0) placements.set(owner, object);
    }
  }

  const providerParents = new Map<number, number>();
  const providerChildren = new Map<number, RiveLayoutProvider[]>();
  for (const provider of providers.values()) {
    const start = artboard.parentIndices[provider.sourceIndex];
    const parent = findRiveLayoutParent(artboard, componentProviders, start, provider.sourceIndex);
    providerParents.set(provider.sourceIndex, parent);
    if (parent < 0) continue;
    const children = providerChildren.get(parent) ?? [];
    children.push(provider);
    providerChildren.set(parent, children);
  }
  for (const children of providerChildren.values()) children.sort(compareRiveLayoutProviders);

  const roots = [...componentProviders.values()]
    .filter((provider) => (providerParents.get(provider.sourceIndex) ?? -1) < 0)
    .sort(compareRiveLayoutProviders);
  const imports: RiveLayoutImport[] = [];
  for (const root of roots) {
    const layoutNodes: LayoutNode[] = [];
    const targets: DisplayObject[] = [];
    appendRiveLayoutProvider(
      artboard,
      nodes,
      componentProviders,
      providerChildren,
      placements,
      root,
      -1,
      null,
      layoutNodes,
      targets,
      diagnostics,
    );
    if (layoutNodes.length > 0) imports.push({ targets, tree: { nodes: layoutNodes } });
  }
  return imports;
}

function findRiveLayoutComponents(
  artboard: Readonly<RiveArtboardGraph>,
  nodes: ReadonlyArray<DisplayObject | null>,
  diagnostics: ImportDiagnostic[] | undefined,
): Map<number, RiveLayoutProvider> {
  const providers = new Map<number, RiveLayoutProvider>();
  for (let index = 0; index < artboard.objects.length; index++) {
    const object = artboard.objects[index];
    if (!isRiveCoreTypeDerivedFrom(object.typeKey, RIVE_LAYOUT_COMPONENT_TYPE_KEY)) continue;
    const styleProperty = object.properties.find((property) => property.key === RIVE_LAYOUT_STYLE_ID);
    if (styleProperty === undefined) continue;
    const styleIndex = typeof styleProperty.value === 'number' ? styleProperty.value : -1;
    const style = artboard.objects[styleIndex];
    if (
      style === undefined ||
      !isRiveCoreTypeDerivedFrom(style.typeKey, RIVE_LAYOUT_COMPONENT_STYLE_TYPE_KEY) ||
      nodes[index] === null ||
      nodes[index] === undefined
    ) {
      reportImportDiagnostic(
        diagnostics,
        ImportDiagnosticSeverity.Drop,
        'rive.layout-unresolved-style',
        'createRiveLayoutImports',
        { index, styleId: styleIndex },
      );
      continue;
    }
    providers.set(index, { sourceIndex: index, styleIndex, targetIndex: index, type: 'component' });
  }
  return providers;
}

function findRiveLayoutParent(
  artboard: Readonly<RiveArtboardGraph>,
  components: ReadonlyMap<number, RiveLayoutProvider>,
  start: number,
  initialChild: number,
): number {
  let index = start;
  let child = initialChild;
  while (index >= 0) {
    if (components.has(index)) return index;
    const object = artboard.objects[index];
    if (object.typeKey === RIVE_NODE_TYPE_KEY) {
      child = index;
      index = artboard.parentIndices[index];
      continue;
    }
    if (isRiveCoreTypeDerivedFrom(object.typeKey, RIVE_SOLO_TYPE_KEY)) {
      const active = readRiveNumber(object, RIVE_SOLO_ACTIVE_COMPONENT, -1);
      if (active >= 0 && active !== child) return RIVE_NO_PARENT;
      child = index;
      index = artboard.parentIndices[index];
      continue;
    }
    return RIVE_NO_PARENT;
  }
  return RIVE_NO_PARENT;
}

function appendRiveLayoutProvider(
  artboard: Readonly<RiveArtboardGraph>,
  displayNodes: ReadonlyArray<DisplayObject | null>,
  components: ReadonlyMap<number, RiveLayoutProvider>,
  childrenByProvider: ReadonlyMap<number, readonly RiveLayoutProvider[]>,
  placements: ReadonlyMap<number, Readonly<RiveCoreObject>>,
  provider: Readonly<RiveLayoutProvider>,
  parentIndex: number,
  parentContext: Readonly<RiveLayoutContext> | null,
  nodes: LayoutNode[],
  targets: DisplayObject[],
  diagnostics: ImportDiagnostic[] | undefined,
): void {
  const target = displayNodes[provider.targetIndex];
  if (target === null || target === undefined) return;

  const source = artboard.objects[provider.sourceIndex];
  const style = artboard.objects[provider.styleIndex];
  const children = childrenByProvider.get(provider.sourceIndex) ?? [];
  const context =
    provider.type === 'component'
      ? createRiveLayoutContext(provider.sourceIndex, style, parentContext?.rtl ?? false, children.length)
      : null;
  const itemStyle =
    parentContext === null
      ? null
      : createRiveItemStyle(artboard, provider, source, style, parentContext, placements.get(provider.sourceIndex));
  const kind = context === null || context.layoutType === RIVE_LAYOUT_TYPE_FLEX ? FlexLayoutKind : GridLayoutKind;
  const containerStyle =
    context === null
      ? null
      : context.layoutType === RIVE_LAYOUT_TYPE_FLEX
        ? createRiveFlexContainerStyle(style, context, diagnostics)
        : createRiveGridContainerStyle(artboard, provider.sourceIndex, style, context, diagnostics);
  const nodeIndex = nodes.length;
  nodes.push({ containerStyle, itemStyle, kind, parentIndex });
  targets.push(target);

  if (!components.has(provider.sourceIndex) || context === null) return;
  for (const child of children) {
    appendRiveLayoutProvider(
      artboard,
      displayNodes,
      components,
      childrenByProvider,
      placements,
      child,
      nodeIndex,
      context,
      nodes,
      targets,
      diagnostics,
    );
  }
}

function createRiveLayoutContext(
  sourceIndex: number,
  style: Readonly<RiveCoreObject>,
  inheritedRtl: boolean,
  childCount: number,
): RiveLayoutContext {
  const rawDirection = readRiveNumber(style, RIVE_DIRECTION, RIVE_DIRECTION_INHERIT);
  const rtl = rawDirection === RIVE_DIRECTION_RTL || (rawDirection === RIVE_DIRECTION_INHERIT && inheritedRtl);
  const flexDirection = readRiveNumber(style, RIVE_FLEX_DIRECTION, RIVE_FLEX_DIRECTION_ROW);
  return {
    childCount,
    layoutType: readRiveNumber(style, RIVE_LAYOUT_TYPE, RIVE_LAYOUT_TYPE_FLEX),
    row: flexDirection === RIVE_FLEX_DIRECTION_ROW || flexDirection === RIVE_FLEX_DIRECTION_ROW_REVERSE,
    rtl,
    sourceIndex,
    style,
  };
}

function createRiveFlexContainerStyle(
  style: Readonly<RiveCoreObject>,
  context: Readonly<RiveLayoutContext>,
  diagnostics: ImportDiagnostic[] | undefined,
): FlexLayoutContainerStyle {
  const rawDirection = readRiveNumber(style, RIVE_FLEX_DIRECTION, RIVE_FLEX_DIRECTION_ROW);
  const direction = mapRiveFlexDirection(rawDirection, context.rtl, diagnostics);
  const alignment = mapRiveFlexAlignment(
    readRiveNumber(style, RIVE_LAYOUT_ALIGNMENT, 0),
    context.row,
    context.rtl,
    diagnostics,
  );
  const wrap = readRiveNumber(style, RIVE_FLEX_WRAP, 0);
  const result: FlexLayoutContainerStyle = {
    align: alignment.align,
    direction,
    justify: alignment.justify,
    wrap: wrap === 1 ? 'wrap' : wrap === 2 ? 'wrap-reverse' : 'nowrap',
  };
  const horizontalGap = readRivePointLength(style, RIVE_GAP_HORIZONTAL, RIVE_GAP_HORIZONTAL_UNITS);
  const verticalGap = readRivePointLength(style, RIVE_GAP_VERTICAL, RIVE_GAP_VERTICAL_UNITS);
  const gap = context.row ? horizontalGap : verticalGap;
  if (gap > 0) result.gap = gap;
  applyRiveInsets(result, style, context.rtl);
  return result;
}

function createRiveGridContainerStyle(
  artboard: Readonly<RiveArtboardGraph>,
  sourceIndex: number,
  style: Readonly<RiveCoreObject>,
  context: Readonly<RiveLayoutContext>,
  diagnostics: ImportDiagnostic[] | undefined,
): GridLayoutContainerStyle {
  if (context.layoutType === RIVE_LAYOUT_TYPE_STACK) {
    const stack: GridLayoutContainerStyle = {
      columns: [{ fraction: 1, kind: 'fraction' }],
      rows: [{ fraction: 1, kind: 'fraction' }],
    };
    applyRiveInsets(stack, style, context.rtl);
    return stack;
  }

  const columns: GridLayoutTrack[] = [];
  const rows: GridLayoutTrack[] = [];
  for (let index = 1; index < artboard.objects.length; index++) {
    if (artboard.parentIndices[index] !== sourceIndex) continue;
    const track = artboard.objects[index];
    if (!isRiveCoreTypeDerivedFrom(track.typeKey, RIVE_GRID_TRACK_TYPE_KEY)) continue;
    const collection = readRiveNumber(track, RIVE_GRID_TRACK_COLLECTION, 0);
    if (collection !== RIVE_GRID_TEMPLATE_COLUMNS && collection !== RIVE_GRID_TEMPLATE_ROWS) continue;
    const mapped = mapRiveGridTrack(track, diagnostics);
    (collection === RIVE_GRID_TEMPLATE_COLUMNS ? columns : rows).push(mapped);
  }
  if (columns.length === 0) columns.push({ kind: 'auto' });
  const requiredRows = Math.max(1, Math.ceil(context.childCount / columns.length));
  if (rows.length === 0) rows.push({ kind: 'auto' });
  while (rows.length < requiredRows) rows.push({ kind: 'auto' });
  const result: GridLayoutContainerStyle = { columns, rows };
  const columnGap = readRivePointLength(style, RIVE_GAP_HORIZONTAL, RIVE_GAP_HORIZONTAL_UNITS);
  const rowGap = readRivePointLength(style, RIVE_GAP_VERTICAL, RIVE_GAP_VERTICAL_UNITS);
  if (columnGap > 0) result.columnGap = columnGap;
  if (rowGap > 0) result.rowGap = rowGap;
  applyRiveInsets(result, style, context.rtl);
  return result;
}

function createRiveItemStyle(
  artboard: Readonly<RiveArtboardGraph>,
  provider: Readonly<RiveLayoutProvider>,
  source: Readonly<RiveCoreObject>,
  style: Readonly<RiveCoreObject>,
  parent: Readonly<RiveLayoutContext>,
  placement: Readonly<RiveCoreObject> | undefined,
): FlexLayoutItemStyle | GridLayoutItemStyle | null {
  if (parent.layoutType === RIVE_LAYOUT_TYPE_STACK) return { column: 0, row: 0 };
  if (parent.layoutType === RIVE_LAYOUT_TYPE_GRID) {
    if (placement === undefined) return null;
    // No sink: this rebuilds the PARENT container purely to read its tracks, once per child item, so
    // passing it would report the same substituted track once per child. The container pass carries it.
    const parentContainer = createRiveGridContainerStyle(artboard, parent.sourceIndex, parent.style, parent, undefined);
    return createRiveGridItemStyle(placement, parentContainer.columns.length, parentContainer.rows.length);
  }
  return createRiveFlexItemStyle(provider, source, style, parent.row);
}

function createRiveFlexItemStyle(
  provider: Readonly<RiveLayoutProvider>,
  source: Readonly<RiveCoreObject>,
  style: Readonly<RiveCoreObject>,
  parentIsRow: boolean,
): FlexLayoutItemStyle {
  const sizing = readRiveSizingValues(provider, source, style);
  const mainScale = parentIsRow ? sizing.widthScale : sizing.heightScale;
  const mainValue = parentIsRow ? sizing.width : sizing.height;
  const mainUnits = parentIsRow ? sizing.widthUnits : sizing.heightUnits;
  const mainFraction = parentIsRow ? sizing.fractionalWidth : sizing.fractionalHeight;
  const crossScale = parentIsRow ? sizing.heightScale : sizing.widthScale;
  const result: FlexLayoutItemStyle = {
    alignSelf: crossScale === RIVE_SCALE_FILL ? 'stretch' : 'auto',
    grow: mainScale === RIVE_SCALE_FILL ? finiteNonNegative(mainFraction) : 0,
    shrink: mainScale === RIVE_SCALE_FILL ? finiteNonNegative(mainFraction) : 0,
  };
  if (mainScale === RIVE_SCALE_FILL) {
    if (provider.type === 'participant') result.basis = 0;
    else if (provider.type === 'nested') result.basis = 'auto';
    else result.basis = readRiveFlexBasis(style);
  } else if (mainScale === RIVE_SCALE_FIXED && mainUnits === RIVE_UNIT_POINT && mainValue >= 0) {
    result.basis = finiteNonNegative(mainValue);
  } else {
    result.basis = 'auto';
  }
  return result;
}

function readRiveSizingValues(
  provider: Readonly<RiveLayoutProvider>,
  source: Readonly<RiveCoreObject>,
  style: Readonly<RiveCoreObject>,
): RiveSizingValues {
  if (provider.type === 'component') {
    return {
      fractionalHeight: readRiveNumber(source, RIVE_LAYOUT_COMPONENT_FRACTIONAL_HEIGHT, 1),
      fractionalWidth: readRiveNumber(source, RIVE_LAYOUT_COMPONENT_FRACTIONAL_WIDTH, 1),
      height: readRiveNumber(source, RIVE_HEIGHT, 0),
      heightScale: readRiveNumber(style, RIVE_HEIGHT_SCALE, RIVE_SCALE_FIXED),
      heightUnits: readRiveNumber(style, RIVE_HEIGHT_UNITS, RIVE_UNIT_POINT),
      width: readRiveNumber(source, RIVE_WIDTH, 0),
      widthScale: readRiveNumber(style, RIVE_WIDTH_SCALE, RIVE_SCALE_FIXED),
      widthUnits: readRiveNumber(style, RIVE_WIDTH_UNITS, RIVE_UNIT_POINT),
    };
  }
  if (provider.type === 'nested') {
    return {
      fractionalHeight: 1,
      fractionalWidth: 1,
      height: readRiveNumber(source, RIVE_NESTED_HEIGHT, -1),
      heightScale: readRiveNumber(source, RIVE_NESTED_HEIGHT_SCALE, RIVE_SCALE_FIXED),
      heightUnits: readRiveNumber(source, RIVE_NESTED_HEIGHT_UNITS, RIVE_UNIT_POINT),
      width: readRiveNumber(source, RIVE_NESTED_WIDTH, -1),
      widthScale: readRiveNumber(source, RIVE_NESTED_WIDTH_SCALE, RIVE_SCALE_FIXED),
      widthUnits: readRiveNumber(source, RIVE_NESTED_WIDTH_UNITS, RIVE_UNIT_POINT),
    };
  }
  return {
    fractionalHeight: readRiveNumber(style, RIVE_PARTICIPANT_FRACTIONAL_HEIGHT, 1),
    fractionalWidth: readRiveNumber(style, RIVE_PARTICIPANT_FRACTIONAL_WIDTH, 1),
    height: readRiveNumber(style, RIVE_PARTICIPANT_HEIGHT, 0),
    heightScale: readRiveNumber(style, RIVE_HEIGHT_SCALE, RIVE_SCALE_FIXED),
    heightUnits: readRiveNumber(style, RIVE_HEIGHT_UNITS, RIVE_UNIT_POINT),
    width: readRiveNumber(style, RIVE_PARTICIPANT_WIDTH, 0),
    widthScale: readRiveNumber(style, RIVE_WIDTH_SCALE, RIVE_SCALE_FIXED),
    widthUnits: readRiveNumber(style, RIVE_WIDTH_UNITS, RIVE_UNIT_POINT),
  };
}

function readRiveFlexBasis(style: Readonly<RiveCoreObject>): number | 'auto' {
  const units = readRiveNumber(style, RIVE_FLEX_BASIS_UNITS, RIVE_UNIT_AUTO);
  return units === RIVE_UNIT_POINT ? finiteNonNegative(readRiveNumber(style, RIVE_FLEX_BASIS, 0)) : 'auto';
}

function createRiveGridItemStyle(
  placement: Readonly<RiveCoreObject>,
  columnCount: number,
  rowCount: number,
): GridLayoutItemStyle {
  const result: GridLayoutItemStyle = {};
  const column = mapRiveGridCell(readRiveNumber(placement, RIVE_GRID_COLUMN, 0), columnCount);
  const row = mapRiveGridCell(readRiveNumber(placement, RIVE_GRID_ROW, 0), rowCount);
  const columnSpan = positiveInteger(readRiveNumber(placement, RIVE_GRID_COLUMN_SPAN, 1));
  const rowSpan = positiveInteger(readRiveNumber(placement, RIVE_GRID_ROW_SPAN, 1));
  if (column === undefined || row === undefined || column + columnSpan > columnCount || row + rowSpan > rowCount) {
    return result;
  }
  result.column = column;
  result.row = row;
  if (columnSpan > 1) result.columnSpan = columnSpan;
  if (rowSpan > 1) result.rowSpan = rowSpan;
  return result;
}

function mapRiveGridCell(value: number, count: number): number | undefined {
  if (value > 0 && value <= count) return value - 1;
  if (value < 0 && count + value >= 0) return count + value;
  return undefined;
}

// The track type the file states survives, or the track silently becomes auto and the row sizes itself
// from content — the same width a stated track would rarely produce, and nothing counts a track as lost.
function mapRiveGridTrack(
  source: Readonly<RiveCoreObject>,
  diagnostics: ImportDiagnostic[] | undefined,
): GridLayoutTrack {
  const type = readRiveNumber(source, RIVE_GRID_TRACK_TYPE, RIVE_GRID_TRACK_AUTO);
  const value = finiteNonNegative(readRiveNumber(source, RIVE_GRID_TRACK_VALUE, 0));
  if (type === RIVE_GRID_TRACK_POINTS) return { kind: 'fixed', size: value };
  if (type === RIVE_GRID_TRACK_FRACTION && value > 0) return { fraction: value, kind: 'fraction' };
  // A stated fraction of zero is degenerate rather than unknown, so it is reported as the same
  // substitution: the file asked for a fraction track and got an auto one either way.
  if (type !== RIVE_GRID_TRACK_AUTO) {
    reportImportDiagnostic(
      diagnostics,
      ImportDiagnosticSeverity.Recover,
      'rive.grid-track-substituted',
      'createScene2DFromRiveDocument',
      { substitutedAs: 'auto', trackType: type, trackValue: value },
    );
  }
  return { kind: 'auto' };
}

// Rive states row as 2, so the terminal arm is a mapping for that value and a substitution for any
// other — the row still lays out, along an axis it was not authored with.
function mapRiveFlexDirection(
  value: number,
  rtl: boolean,
  diagnostics: ImportDiagnostic[] | undefined,
): FlexLayoutDirection {
  if (value === RIVE_FLEX_DIRECTION_COLUMN) return 'column';
  if (value === RIVE_FLEX_DIRECTION_COLUMN_REVERSE) return 'column-reverse';
  if (value === RIVE_FLEX_DIRECTION_ROW_REVERSE) return rtl ? 'row' : 'row-reverse';
  if (value !== RIVE_FLEX_DIRECTION_ROW) {
    reportImportDiagnostic(
      diagnostics,
      ImportDiagnosticSeverity.Recover,
      'rive.flex-direction-substituted',
      'createScene2DFromRiveDocument',
      { directionValue: value, substitutedAs: 'row' },
    );
  }
  return rtl ? 'row-reverse' : 'row';
}

function mapRiveFlexAlignment(
  value: number,
  row: boolean,
  rtl: boolean,
  diagnostics: ImportDiagnostic[] | undefined,
): { align: FlexLayoutAlign; justify: FlexLayoutJustify } {
  if (value >= 9 && value <= 11) {
    const cross: RiveAxisAlignment = value === 9 ? 'start' : value === 10 ? 'center' : 'end';
    return { align: row || !rtl ? cross : reverseFlexAlign(cross), justify: 'space-between' };
  }
  // 0-8 is the three-by-three alignment grid and 9-11 is space-between, so anything else is a mode
  // this reader does not have. It collapses to top-left, which lays out cleanly and looks authored.
  if (value < 0 || value > 8) {
    reportImportDiagnostic(
      diagnostics,
      ImportDiagnosticSeverity.Recover,
      'rive.flex-alignment-substituted',
      'createScene2DFromRiveDocument',
      { alignmentValue: value, substitutedAs: 'start' },
    );
  }
  const normalized = value >= 0 && value <= 8 ? value : 0;
  const horizontal = mapRiveAlignmentAxis(normalized % 3);
  const vertical = mapRiveAlignmentAxis(Math.floor(normalized / 3));
  return row
    ? { align: vertical, justify: horizontal }
    : { align: rtl ? reverseFlexAlign(horizontal) : horizontal, justify: vertical };
}

function mapRiveAlignmentAxis(value: number): RiveAxisAlignment {
  return value === 1 ? 'center' : value === 2 ? 'end' : 'start';
}

function reverseFlexAlign(value: RiveAxisAlignment): RiveAxisAlignment {
  return value === 'start' ? 'end' : value === 'end' ? 'start' : value;
}

function applyRiveInsets(
  target: FlexLayoutContainerStyle | GridLayoutContainerStyle,
  style: Readonly<RiveCoreObject>,
  rtl: boolean,
): void {
  const logicalLeft =
    readRivePointLength(style, RIVE_PADDING_LEFT, RIVE_PADDING_LEFT_UNITS) +
    readRivePointLength(style, RIVE_BORDER_LEFT, RIVE_BORDER_LEFT_UNITS);
  const logicalRight =
    readRivePointLength(style, RIVE_PADDING_RIGHT, RIVE_PADDING_RIGHT_UNITS) +
    readRivePointLength(style, RIVE_BORDER_RIGHT, RIVE_BORDER_RIGHT_UNITS);
  const top =
    readRivePointLength(style, RIVE_PADDING_TOP, RIVE_PADDING_TOP_UNITS) +
    readRivePointLength(style, RIVE_BORDER_TOP, RIVE_BORDER_TOP_UNITS);
  const bottom =
    readRivePointLength(style, RIVE_PADDING_BOTTOM, RIVE_PADDING_BOTTOM_UNITS) +
    readRivePointLength(style, RIVE_BORDER_BOTTOM, RIVE_BORDER_BOTTOM_UNITS);
  const left = rtl ? logicalRight : logicalLeft;
  const right = rtl ? logicalLeft : logicalRight;
  if (left > 0) target.paddingLeft = left;
  if (right > 0) target.paddingRight = right;
  if (top > 0) target.paddingTop = top;
  if (bottom > 0) target.paddingBottom = bottom;
}

function readRivePointLength(source: Readonly<RiveCoreObject>, valueKey: number, unitsKey: number): number {
  const value = readRiveNumber(source, valueKey, 0);
  const units = readRiveNumber(source, unitsKey, RIVE_UNIT_UNDEFINED);
  return units === RIVE_UNIT_POINT ? finiteNonNegative(value) : 0;
}

function readRiveNumber(source: Readonly<RiveCoreObject>, key: number, fallback: number): number {
  const property = source.properties.find((candidate) => candidate.key === key);
  return typeof property?.value === 'number' ? property.value : fallback;
}

function finiteNonNegative(value: number): number {
  return Number.isFinite(value) && value > 0 ? value : 0;
}

function positiveInteger(value: number): number {
  return Number.isInteger(value) && value > 0 ? value : 1;
}

function compareRiveLayoutProviders(a: Readonly<RiveLayoutProvider>, b: Readonly<RiveLayoutProvider>): number {
  return a.sourceIndex - b.sourceIndex;
}

const RIVE_NO_PARENT = -1;
const RIVE_NODE_TYPE_KEY = 2;
const RIVE_SOLO_TYPE_KEY = 147;
const RIVE_LAYOUT_COMPONENT_TYPE_KEY = 409;
const RIVE_LAYOUT_COMPONENT_STYLE_TYPE_KEY = 420;
const RIVE_NESTED_ARTBOARD_LAYOUT_TYPE_KEY = 452;
const RIVE_LAYOUT_PARTICIPANT_TYPE_KEY = 1066;
const RIVE_GRID_TRACK_TYPE_KEY = 1058;
const RIVE_GRID_ITEM_PLACEMENT_TYPE_KEY = 1068;

const RIVE_WIDTH = 7;
const RIVE_HEIGHT = 8;
const RIVE_LAYOUT_STYLE_ID = 494;
const RIVE_SOLO_ACTIVE_COMPONENT = 296;
const RIVE_GAP_HORIZONTAL = 498;
const RIVE_GAP_VERTICAL = 499;
const RIVE_BORDER_LEFT = 504;
const RIVE_BORDER_RIGHT = 505;
const RIVE_BORDER_TOP = 506;
const RIVE_BORDER_BOTTOM = 507;
const RIVE_PADDING_LEFT = 512;
const RIVE_PADDING_RIGHT = 513;
const RIVE_PADDING_TOP = 514;
const RIVE_PADDING_BOTTOM = 515;
const RIVE_FLEX_BASIS = 523;
const RIVE_FLEX_DIRECTION = 598;
const RIVE_DIRECTION = 599;
const RIVE_FLEX_WRAP = 604;
const RIVE_WIDTH_UNITS = 607;
const RIVE_HEIGHT_UNITS = 608;
const RIVE_BORDER_LEFT_UNITS = 609;
const RIVE_BORDER_RIGHT_UNITS = 610;
const RIVE_BORDER_TOP_UNITS = 611;
const RIVE_BORDER_BOTTOM_UNITS = 612;
const RIVE_PADDING_LEFT_UNITS = 617;
const RIVE_PADDING_RIGHT_UNITS = 618;
const RIVE_PADDING_TOP_UNITS = 619;
const RIVE_PADDING_BOTTOM_UNITS = 620;
const RIVE_GAP_HORIZONTAL_UNITS = 625;
const RIVE_GAP_VERTICAL_UNITS = 626;
const RIVE_LAYOUT_ALIGNMENT = 632;
const RIVE_WIDTH_SCALE = 655;
const RIVE_HEIGHT_SCALE = 656;
const RIVE_NESTED_WIDTH = 663;
const RIVE_NESTED_HEIGHT = 664;
const RIVE_NESTED_WIDTH_UNITS = 665;
const RIVE_NESTED_HEIGHT_UNITS = 666;
const RIVE_NESTED_WIDTH_SCALE = 667;
const RIVE_NESTED_HEIGHT_SCALE = 668;
const RIVE_LAYOUT_COMPONENT_FRACTIONAL_WIDTH = 706;
const RIVE_LAYOUT_COMPONENT_FRACTIONAL_HEIGHT = 707;
const RIVE_FLEX_BASIS_UNITS = 705;
const RIVE_GRID_COLUMN = 1047;
const RIVE_GRID_ROW = 1048;
const RIVE_GRID_COLUMN_SPAN = 1049;
const RIVE_GRID_ROW_SPAN = 1050;
const RIVE_PARTICIPANT_FRACTIONAL_WIDTH = 1057;
const RIVE_PARTICIPANT_FRACTIONAL_HEIGHT = 1058;
const RIVE_LAYOUT_TYPE = 1059;
const RIVE_GRID_TRACK_COLLECTION = 1061;
const RIVE_GRID_TRACK_TYPE = 1062;
const RIVE_GRID_TRACK_VALUE = 1063;
const RIVE_PARTICIPANT_WIDTH = 1066;
const RIVE_PARTICIPANT_HEIGHT = 1067;

const RIVE_LAYOUT_TYPE_FLEX = 0;
const RIVE_LAYOUT_TYPE_GRID = 1;
const RIVE_LAYOUT_TYPE_STACK = 2;
const RIVE_SCALE_FIXED = 0;
const RIVE_SCALE_FILL = 1;
const RIVE_UNIT_UNDEFINED = 0;
const RIVE_UNIT_POINT = 1;
const RIVE_UNIT_AUTO = 3;
const RIVE_DIRECTION_INHERIT = 0;
const RIVE_DIRECTION_RTL = 2;
const RIVE_FLEX_DIRECTION_COLUMN = 0;
const RIVE_FLEX_DIRECTION_COLUMN_REVERSE = 1;
const RIVE_FLEX_DIRECTION_ROW = 2;
const RIVE_FLEX_DIRECTION_ROW_REVERSE = 3;
const RIVE_GRID_TEMPLATE_COLUMNS = 0;
const RIVE_GRID_TEMPLATE_ROWS = 1;
const RIVE_GRID_TRACK_AUTO = 0;
const RIVE_GRID_TRACK_POINTS = 1;
const RIVE_GRID_TRACK_FRACTION = 3;
