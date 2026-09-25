import { reportImportDiagnostic } from '@flighthq/importdiagnostics/contract';
import { copyShapeCommands, createScale9Shape, createShape } from '@flighthq/shape/contract';
import type {
  Scale9Shape,
  Shape,
  SwfTagHandler,
  SwfTagParseResult,
  SwfTagParseState,
  SwfTagReader,
  SwfTagRectangle,
  SwfTimeline,
} from '@flighthq/types/contract';
import { ImportDiagnosticSeverity, Scale9ShapeKind, ShapeKind } from '@flighthq/types/contract';

import { readSwfBoundedDefinitionHeader } from './swfBoundedDefinition';
import { acquireSwfImageTexture } from './swfImageTexture';
import { applySwfAuthoredBounds } from './swfNode';
import { readSwfRectangle } from './swfPrimitive';
import { SwfReader } from './swfReader';
import { createSwfShape } from './swfShape';

const TAG_DEFINE_SHAPE = 2;

const TAG_DEFINE_SHAPE_2 = 22;

const TAG_DEFINE_SHAPE_3 = 32;

const TAG_DEFINE_SHAPE_4 = 83;

export const swfDefineShapeHandler: SwfTagHandler = {
  instantiate: {
    producesKinds: [ShapeKind, Scale9ShapeKind],
    createPlacementNode(parsed, characterId, bounds, diagnostics) {
      const grid = parsed.scalingGrids.get(characterId);
      const sprite = parsed.sprites.get(characterId);
      if (grid !== undefined && sprite !== undefined) {
        const scale9 = createSwfScale9ShapeNode(sprite, grid, parsed, bounds);
        if (scale9 !== null) return scale9;
        reportImportDiagnostic(
          diagnostics,
          ImportDiagnosticSeverity.Drop,
          'swf.scaling-grid-dropped',
          'populateSwfTimelineNode',
          { characterId },
        );
        return null;
      }
      const shape = parsed.shapes.get(characterId);
      return shape === undefined ? null : createSwfShapeNode(shape, bounds);
    },
    hasPlacementContent(parsed, characterId) {
      return parsed.shapes.has(characterId);
    },
  },
  tags: [TAG_DEFINE_SHAPE, TAG_DEFINE_SHAPE_2, TAG_DEFINE_SHAPE_3, TAG_DEFINE_SHAPE_4],
  parse(body, tag, state) {
    const characterId = readSwfBoundedDefinitionHeader(body, state, false);
    if (characterId === 0) return false;
    readSwfShapeBody(body, state, characterId, resolveSwfShapeVersion(tag));
    return true;
  },
};

function readSwfShapeBody(body: SwfTagReader, state: SwfTagParseState, characterId: number, version: number): void {
  const reader = new SwfReader(body.source, body.pos, body.end);
  if (version >= 4) {
    readSwfRectangle(reader);
    reader.readUint8();
  }
  if (!reader.valid) return;
  const shape = createSwfShape(
    reader,
    version,
    (fillCharacterId, repeat, smoothed) => acquireSwfImageTexture(state, fillCharacterId, repeat, smoothed),
    state.diagnostics,
  );
  if (shape === null) {
    reportImportDiagnostic(
      state.diagnostics,
      ImportDiagnosticSeverity.Recover,
      'swf.shape-body-unreadable',
      'readSwfShapeDefinition',
      {
        capability: version === 1 ? 'swf.shape.define-shape' : `swf.shape.define-shape-${version}`,
        characterId,
        version,
      },
    );
    return;
  }
  state.shapes.set(characterId, shape);
}

function resolveSwfShapeVersion(code: number): number {
  if (code === TAG_DEFINE_SHAPE) return 1;
  if (code === TAG_DEFINE_SHAPE_2) return 2;
  if (code === TAG_DEFINE_SHAPE_3) return 3;
  return code === TAG_DEFINE_SHAPE_4 ? 4 : 0;
}

function createSwfShapeNode(template: Readonly<Shape>, bounds: SwfTagRectangle | null): Shape {
  const target = createShape();
  copyShapeCommands(target, template);
  applySwfAuthoredBounds(target, bounds);
  return target;
}

function createSwfScale9ShapeNode(
  sprite: Readonly<SwfTimeline>,
  grid: Readonly<SwfTagRectangle>,
  parsed: Readonly<SwfTagParseResult>,
  bounds: SwfTagRectangle | null,
): Scale9Shape | null {
  if (sprite.frames.length !== 1 || sprite.actions.size > 0) return null;
  const placements = [...sprite.frames[0].values()];
  if (placements.length !== 1) return null;
  const inner = placements[0];
  if (inner.name !== null || inner.clipDepth > 0 || inner.alpha !== 1) return null;
  const { a, b, c, d, tx, ty } = inner.matrix;
  if (a !== 1 || b !== 0 || c !== 0 || d !== 1 || tx !== 0 || ty !== 0) return null;
  const shape = parsed.shapes.get(inner.characterId);
  if (shape === undefined) return null;

  const target = createScale9Shape({ height: grid.height, width: grid.width, x: grid.x, y: grid.y });
  copyShapeCommands(target, shape);
  applySwfAuthoredBounds(target, bounds);
  return target;
}
