import { createDisplayObject } from '@flighthq/scene2d/contract';
import type {
  ImportDiagnostic,
  RiveArtboardGraph,
  RiveArtboardImportContext,
  RiveCoreObject,
  RiveProperty,
  Shape,
} from '@flighthq/types/contract';
import { ImportDiagnosticSeverity, RiveFieldType } from '@flighthq/types/contract';

import { createRiveArtboardImportContext, createRiveImportRegistry } from './riveImportRegistry.ts';
import {
  importRiveNSlicedNodeComponent,
  importRiveShapeComponent,
  rebuildRiveShapes,
  registerRiveShapeHandlers,
} from './riveShapeNode.ts';
import { registerRivePaintHandlers } from './riveShapePaint.ts';
import { registerRivePathHandlers } from './riveShapePath.ts';

const ARTBOARD = 1;
const SHAPE = 3;
const RECTANGLE = 7;
const FILL = 20;
const SOLID_COLOR = 18;
const NSLICED_NODE = 508;

const NAME = 4;
const PARAMETRIC_WIDTH = 20;
const PARAMETRIC_HEIGHT = 21;
const SOLID_COLOR_VALUE = 37;

describe('importRiveNSlicedNodeComponent', () => {
  it('substitutes a container and reports the slicing it cannot carry', () => {
    const diagnostics: ImportDiagnostic[] = [];
    const context = contextFor([object(NSLICED_NODE, [text(NAME, 'sliced')])], diagnostics);

    const node = importRiveNSlicedNodeComponent(context, 1);

    expect(node?.name).toBe('sliced');
    expect(diagnostics.map((entry) => entry.kind)).toEqual(['rive.nine-slice-substituted']);
    // Recover, not Drop: the node and its children survive, and only the fixed-corner scaling is lost.
    expect(diagnostics[0].severity).toBe(ImportDiagnosticSeverity.Recover);
  });
});

describe('importRiveShapeComponent', () => {
  it('builds a shape carrying the component name', () => {
    const context = contextFor([object(SHAPE, [text(NAME, 'box')])]);

    expect(importRiveShapeComponent(context, 1)?.name).toBe('box');
  });
});

describe('rebuildRiveShapes', () => {
  it('fills each shape from the paths collected under it, and stores the rebuild', () => {
    const context = contextFor([object(SHAPE, [text(NAME, 'box')]), rectangle()]);
    const registry = context.registry;
    registerRivePathHandlers(registry);
    registerRivePaintHandlers(registry);
    context.nodes.push(importRiveShapeComponent(context, 1));
    const path = registry.handlers.get(12);
    path?.importComponent?.(context, 2);

    rebuildRiveShapes(context);

    expect((context.nodes[1] as Shape).data.commands.length).toBeGreaterThan(0);
    expect(context.rebuilds.has(1)).toBe(true);
  });

  it('draws geometry with no paint when the paint family is not registered', () => {
    const painted = buildShapeCommands(true);
    const bare = buildShapeCommands(false);

    // The same geometry either way: what the paint family buys is the fill around it, so the
    // unpainted shape is strictly shorter rather than empty.
    expect(bare.length).toBeGreaterThan(0);
    expect(bare.length).toBeLessThan(painted.length);
  });

  it('skips a shape index whose node never became a display object', () => {
    const context = contextFor([object(SHAPE, [text(NAME, 'box')])]);
    context.nodes.push(null);
    context.shapePaths.set(1, []);

    expect(() => rebuildRiveShapes(context)).not.toThrow();
    expect(context.rebuilds.size).toBe(0);
  });
});

describe('registerRiveShapeHandlers', () => {
  it('claims the shape and the nine-sliced node', () => {
    const registry = createRiveImportRegistry();
    registerRiveShapeHandlers(registry);

    expect(registry.handlers.has(SHAPE)).toBe(true);
    expect(registry.handlers.has(NSLICED_NODE)).toBe(true);
  });
});

function buildShapeCommands(withPaint: boolean): readonly unknown[] {
  const context = contextFor([object(SHAPE, [text(NAME, 'box')]), rectangle(), fill()]);
  registerRivePathHandlers(context.registry);
  if (withPaint) registerRivePaintHandlers(context.registry);
  context.nodes.push(importRiveShapeComponent(context, 1));
  context.registry.handlers.get(12)?.importComponent?.(context, 2);
  context.nodes.push(null);
  rebuildRiveShapes(context);
  return (context.nodes[1] as Shape).data.commands;
}

function contextFor(components: RiveCoreObject[], diagnostics?: ImportDiagnostic[]): RiveArtboardImportContext {
  const objects = [object(ARTBOARD, [text(NAME, 'Board')]), ...components];
  const graph: RiveArtboardGraph = {
    objects,
    // Every component here hangs directly off the shape at index 1, except the shape itself.
    parentIndices: objects.map((_, index) => (index === 0 ? -1 : index === 1 ? 0 : 1)),
    streamEnd: objects.length,
    streamStart: 0,
  };
  return createRiveArtboardImportContext(
    createRiveImportRegistry(),
    graph,
    objects,
    createDisplayObject({ name: 'Board' }),
    [],
    diagnostics,
  );
}

function fill(): RiveCoreObject {
  return object(FILL, []);
}

function object(typeKey: number, properties: RiveProperty[]): RiveCoreObject {
  return { properties, typeKey };
}

function rectangle(): RiveCoreObject {
  return object(RECTANGLE, [double(PARAMETRIC_WIDTH, 10), double(PARAMETRIC_HEIGHT, 20)]);
}

function double(key: number, value: number): RiveProperty {
  return { key, type: RiveFieldType.Double, value };
}

function text(key: number, value: string): RiveProperty {
  return { key, type: RiveFieldType.String, value };
}
