import { createDisplayObject } from '@flighthq/scene2d/contract';
import type { DisplayObject, ImportDiagnostic, RiveArtboardGraph, RiveCoreObject } from '@flighthq/types/contract';
import { FlexLayoutKind, GridLayoutKind, RiveFieldType } from '@flighthq/types/contract';

import { createRiveLayoutImports } from './riveLayout';

const ARTBOARD = 1;
const SHAPE = 3;
const SOLO = 147;
const LAYOUT_COMPONENT = 409;
const LAYOUT_COMPONENT_STYLE = 420;
const GRID_TRACK = 1058;
const LAYOUT_PARTICIPANT = 1066;
const GRID_ITEM_PLACEMENT = 1068;

const WIDTH = 7;
const HEIGHT = 8;
const STYLE_ID = 494;
const SOLO_ACTIVE_COMPONENT = 296;
const GAP_HORIZONTAL = 498;
const BORDER_LEFT = 504;
const PADDING_LEFT = 512;
const FLEX_BASIS = 523;
const FLEX_DIRECTION = 598;
const GAP_HORIZONTAL_UNITS = 625;
const BORDER_LEFT_UNITS = 609;
const PADDING_LEFT_UNITS = 617;
const LAYOUT_ALIGNMENT = 632;
const WIDTH_SCALE = 655;
const HEIGHT_SCALE = 656;
const FLEX_BASIS_UNITS = 705;
const FRACTIONAL_WIDTH = 706;
const PARTICIPANT_FRACTIONAL_WIDTH = 1057;
const LAYOUT_TYPE = 1059;
const GRID_TRACK_COLLECTION = 1061;
const GRID_TRACK_TYPE = 1062;
const GRID_TRACK_VALUE = 1063;
const PARTICIPANT_WIDTH = 1066;
const PARTICIPANT_HEIGHT = 1067;
const GRID_COLUMN = 1047;
const GRID_ROW = 1048;
const GRID_COLUMN_SPAN = 1049;

describe('createRiveLayoutImports', () => {
  it('maps a flex root and participant while leaving intrinsic measurements to the caller', () => {
    const scene = build(
      [
        object(ARTBOARD, { [STYLE_ID]: 1 }),
        object(LAYOUT_COMPONENT_STYLE, {
          [FLEX_DIRECTION]: 2,
          [LAYOUT_ALIGNMENT]: 4,
          [GAP_HORIZONTAL]: 12,
          [GAP_HORIZONTAL_UNITS]: 1,
          [PADDING_LEFT]: 5,
          [PADDING_LEFT_UNITS]: 1,
          [BORDER_LEFT]: 2,
          [BORDER_LEFT_UNITS]: 1,
        }),
        object(SHAPE, {}),
        object(LAYOUT_PARTICIPANT, {
          [WIDTH_SCALE]: 1,
          [HEIGHT_SCALE]: 1,
          [PARTICIPANT_FRACTIONAL_WIDTH]: 2.5,
        }),
      ],
      [-1, 0, 0, 2],
    );

    const imports = createRiveLayoutImports(scene.graph, scene.nodes);

    expect(imports).toHaveLength(1);
    expect(Object.keys(imports[0]).sort()).toEqual(['targets', 'tree']);
    expect(imports[0].targets).toEqual([scene.nodes[0], scene.nodes[2]]);
    expect(imports[0].tree.nodes).toEqual([
      {
        containerStyle: {
          align: 'center',
          direction: 'row',
          gap: 12,
          justify: 'center',
          paddingLeft: 7,
          wrap: 'nowrap',
        },
        itemStyle: null,
        kind: FlexLayoutKind,
        parentIndex: -1,
      },
      {
        containerStyle: null,
        itemStyle: { alignSelf: 'stretch', basis: 0, grow: 2.5, shrink: 2.5 },
        kind: FlexLayoutKind,
        parentIndex: 0,
      },
    ]);
  });

  it('keeps a nested component container style separate from its parent-interpreted item style', () => {
    const scene = build(
      [
        object(ARTBOARD, { [STYLE_ID]: 1 }),
        object(LAYOUT_COMPONENT_STYLE, { [FLEX_DIRECTION]: 2 }),
        object(LAYOUT_COMPONENT, { [STYLE_ID]: 3, [WIDTH]: 120, [FRACTIONAL_WIDTH]: 3 }),
        object(LAYOUT_COMPONENT_STYLE, {
          [FLEX_BASIS]: 40,
          [FLEX_BASIS_UNITS]: 1,
          [FLEX_DIRECTION]: 0,
          [WIDTH_SCALE]: 1,
        }),
        object(SHAPE, {}),
        object(LAYOUT_PARTICIPANT, { [PARTICIPANT_HEIGHT]: 24, [PARTICIPANT_WIDTH]: 16 }),
      ],
      [-1, 0, 0, 2, 2, 4],
    );

    const layout = createRiveLayoutImports(scene.graph, scene.nodes)[0];

    expect(layout.targets).toEqual([scene.nodes[0], scene.nodes[2], scene.nodes[4]]);
    expect(layout.tree.nodes[1]).toEqual({
      containerStyle: {
        align: 'start',
        direction: 'column',
        justify: 'start',
        wrap: 'nowrap',
      },
      itemStyle: { alignSelf: 'auto', basis: 40, grow: 3, shrink: 3 },
      kind: FlexLayoutKind,
      parentIndex: 0,
    });
    expect(layout.tree.nodes[2]).toEqual({
      containerStyle: null,
      itemStyle: { alignSelf: 'auto', basis: 24, grow: 0, shrink: 0 },
      kind: FlexLayoutKind,
      parentIndex: 1,
    });
  });

  it('returns a component below a non-layout ancestor as an independent root', () => {
    const scene = build(
      [
        object(ARTBOARD, {}),
        object(LAYOUT_COMPONENT, { [STYLE_ID]: 2 }),
        object(LAYOUT_COMPONENT_STYLE, { [FLEX_DIRECTION]: 2 }),
      ],
      [-1, 0, 1],
    );

    const imports = createRiveLayoutImports(scene.graph, scene.nodes);

    expect(imports).toHaveLength(1);
    expect(imports[0].targets).toEqual([scene.nodes[1]]);
    expect(imports[0].tree.nodes[0].parentIndex).toBe(-1);
  });

  it('includes only the active provider below a Solo', () => {
    const scene = build(
      [
        object(ARTBOARD, { [STYLE_ID]: 1 }),
        object(LAYOUT_COMPONENT_STYLE, {}),
        object(SOLO, { [SOLO_ACTIVE_COMPONENT]: 5 }),
        object(SHAPE, {}),
        object(LAYOUT_PARTICIPANT, {}),
        object(SHAPE, {}),
        object(LAYOUT_PARTICIPANT, {}),
      ],
      [-1, 0, 0, 2, 3, 2, 5],
    );

    const layout = createRiveLayoutImports(scene.graph, scene.nodes)[0];

    expect(layout.targets).toEqual([scene.nodes[0], scene.nodes[5]]);
    expect(layout.tree.nodes).toHaveLength(2);
  });

  it('maps explicit grid tracks and one-based item placement', () => {
    const scene = build(
      [
        object(ARTBOARD, { [STYLE_ID]: 1 }),
        object(LAYOUT_COMPONENT_STYLE, { [LAYOUT_TYPE]: 1 }),
        object(GRID_TRACK, {
          [GRID_TRACK_COLLECTION]: 0,
          [GRID_TRACK_TYPE]: 1,
          [GRID_TRACK_VALUE]: 20,
        }),
        object(GRID_TRACK, {
          [GRID_TRACK_COLLECTION]: 0,
          [GRID_TRACK_TYPE]: 3,
          [GRID_TRACK_VALUE]: 2,
        }),
        object(GRID_TRACK, { [GRID_TRACK_COLLECTION]: 0, [GRID_TRACK_TYPE]: 0 }),
        object(GRID_TRACK, { [GRID_TRACK_COLLECTION]: 1, [GRID_TRACK_TYPE]: 0 }),
        object(SHAPE, {}),
        object(LAYOUT_PARTICIPANT, {}),
        object(GRID_ITEM_PLACEMENT, {
          [GRID_COLUMN]: 2,
          [GRID_ROW]: 1,
          [GRID_COLUMN_SPAN]: 2,
        }),
      ],
      [-1, 0, 0, 0, 0, 0, 0, 6, 6],
    );

    const nodes = createRiveLayoutImports(scene.graph, scene.nodes)[0].tree.nodes;

    expect(nodes[0]).toMatchObject({
      containerStyle: {
        columns: [{ kind: 'fixed', size: 20 }, { fraction: 2, kind: 'fraction' }, { kind: 'auto' }],
        rows: [{ kind: 'auto' }],
      },
      kind: GridLayoutKind,
    });
    expect(nodes[1]).toEqual({
      containerStyle: null,
      itemStyle: { column: 1, columnSpan: 2, row: 0 },
      kind: FlexLayoutKind,
      parentIndex: 0,
    });
  });

  it('maps stack layout to one overlapping grid cell', () => {
    const scene = build(
      [
        object(ARTBOARD, { [STYLE_ID]: 1 }),
        object(LAYOUT_COMPONENT_STYLE, { [LAYOUT_TYPE]: 2 }),
        object(SHAPE, {}),
        object(LAYOUT_PARTICIPANT, {}),
      ],
      [-1, 0, 0, 2],
    );

    const nodes = createRiveLayoutImports(scene.graph, scene.nodes)[0].tree.nodes;

    expect(nodes[0]).toMatchObject({
      containerStyle: {
        columns: [{ fraction: 1, kind: 'fraction' }],
        rows: [{ fraction: 1, kind: 'fraction' }],
      },
      kind: GridLayoutKind,
    });
    expect(nodes[1].itemStyle).toEqual({ column: 0, row: 0 });
  });

  it('reports a layout component whose style id cannot be resolved', () => {
    const diagnostics: ImportDiagnostic[] = [];
    const scene = build([object(ARTBOARD, { [STYLE_ID]: 99 })], [-1]);

    expect(createRiveLayoutImports(scene.graph, scene.nodes, diagnostics)).toEqual([]);
    expect(diagnostics).toMatchObject([
      {
        detail: { index: 0, styleId: 99 },
        kind: 'rive.layout-unresolved-style',
        origin: 'createRiveLayoutImports',
        severity: 'Drop',
      },
    ]);
  });
});

interface TestScene {
  graph: RiveArtboardGraph;
  nodes: Array<DisplayObject | null>;
}

function build(objects: RiveCoreObject[], parentIndices: number[]): TestScene {
  return {
    graph: { objects, parentIndices, streamEnd: objects.length, streamStart: 0 },
    nodes: objects.map((source) =>
      source.typeKey === ARTBOARD || source.typeKey === SHAPE || source.typeKey === LAYOUT_COMPONENT
        ? createDisplayObject()
        : null,
    ),
  };
}

function object(typeKey: number, properties: Readonly<Record<number, number>>): RiveCoreObject {
  return {
    properties: Object.entries(properties).map(([key, value]) => ({
      key: Number(key),
      type: RiveFieldType.Double,
      value,
    })),
    typeKey,
  };
}
