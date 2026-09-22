import { reportImportDiagnostic } from '@flighthq/importdiagnostics/contract';
import { copyShapeCommands, createScale9Shape, createShape } from '@flighthq/shape/contract';
import type {
  ImportDiagnostic,
  MorphShape,
  Scale9Shape,
  Shape,
  SwfTagFamily,
  SwfTagParseResult,
  SwfTagParseState,
  SwfTagReader,
  SwfTagRectangle,
  SwfTimeline,
} from '@flighthq/types/contract';
import { ImportDiagnosticSeverity } from '@flighthq/types/contract';

import { readSwfBoundedDefinitionHeader } from './swfBoundedDefinition';
import { acquireSwfImageTexture } from './swfImageTexture';
import { createSwfMorphShape } from './swfMorphShape';
import { applySwfAuthoredBounds, createSwfMorphShapeTarget } from './swfNode';
import { readSwfRectangle } from './swfPrimitive';
import { SwfReader } from './swfReader';
import { createSwfShape } from './swfShape';

// Static and morph shape definitions: the geometry a SWF draws with. Registering this family is what
// pulls path and shape decoding, and the nodes those definitions become, into a build.

// The tag codes this family claims. Declared above the family value rather than at the foot of
// the file because the value reads them when the module initializes.
const TAG_DEFINE_MORPH_SHAPE = 46;
const TAG_DEFINE_MORPH_SHAPE_2 = 84;
const TAG_DEFINE_SHAPE = 2;
const TAG_DEFINE_SHAPE_2 = 22;
const TAG_DEFINE_SHAPE_3 = 32;
const TAG_DEFINE_SHAPE_4 = 83;

export const swfShapeTagFamily: SwfTagFamily = {
  instantiate: {
    createPlacementNode(parsed, characterId, bounds, diagnostics) {
      // A scaling grid collapses its wrapper sprite into one nine-slice shape, so the node it produces is
      // the whole symbol rather than a container the sprite family then populates.
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
      const morphShape = parsed.morphShapes.get(characterId);
      if (morphShape !== undefined) {
        return createSwfMorphShapeTarget(morphShape, bounds, parsed.morphBounds.get(characterId));
      }
      const shape = parsed.shapes.get(characterId);
      return shape === undefined ? null : createSwfShapeNode(shape, bounds);
    },
    hasPlacementContent(parsed, characterId) {
      return parsed.shapes.has(characterId) || parsed.morphShapes.has(characterId);
    },
  },
  tags: [
    TAG_DEFINE_SHAPE,
    TAG_DEFINE_SHAPE_2,
    TAG_DEFINE_SHAPE_3,
    TAG_DEFINE_SHAPE_4,
    TAG_DEFINE_MORPH_SHAPE,
    TAG_DEFINE_MORPH_SHAPE_2,
  ],
  parse(body, tag, state) {
    const morphVersion = resolveSwfMorphShapeVersion(tag);
    const characterId = readSwfBoundedDefinitionHeader(body, state, morphVersion > 0);
    if (characterId === 0) return false;
    if (morphVersion > 0) readSwfMorphShapeBody(body, state, characterId, morphVersion);
    else readSwfShapeBody(body, state, characterId, resolveSwfShapeVersion(tag));
    return true;
  },
};

// Decodes a shape definition's geometry on a reader of its own, so a body this decoder cannot read costs
// only that body's geometry. The definition keeps its authored bounds and contributes no drawing, which
// is what every shape did before any geometry was decoded, rather than failing the whole document.
function readSwfShapeBody(body: SwfTagReader, state: SwfTagParseState, characterId: number, version: number): void {
  const reader = new SwfReader(body.source, body.pos, body.end);
  if (version >= 4) {
    // Shape 4 carries an edge-bounds RECT and a flags byte between its bounds and its styles.
    readSwfRectangle(reader);
    reader.readUint8();
  }
  if (!reader.valid) return;
  // The fill's character is not this shape's, hence the distinct name: a bitmap fill names whatever
  // character carries its pixels, which may be defined later in the tag stream.
  const shape = createSwfShape(
    reader,
    version,
    (fillCharacterId, repeat, smoothed) => acquireSwfImageTexture(state, fillCharacterId, repeat, smoothed),
    state.diagnostics,
  );
  if (shape === null) {
    // Recover rather than Drop: the character survives as the bounded placeholder it was before any
    // geometry existed, so the document still places and sizes it — only the drawing is missing.
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

// Decodes a morph definition's geometry and paint on a reader of its own, so a body this decoder cannot
// read costs only that body. The definition keeps its authored bounds and contributes no drawing, which
// is the same degradation a static shape gets.
function readSwfMorphShapeBody(
  body: SwfTagReader,
  state: SwfTagParseState,
  characterId: number,
  version: number,
): void {
  // A morph is stored as a factory rather than a node: progress is per placement, so two placements of
  // one character sit at different points along the same morph and cannot share one node's sampled path.
  // Decoding is deferred to first use, so a definition nothing places costs only its bytes.
  const source = body.source;
  const start = body.pos;
  const end = body.end;
  // Only the parse-time validation call carries the sink. The stored closure runs again per placement,
  // potentially long after import returned, and a sink written to then would append to a collection
  // whose consumer has already read it.
  const decode = (diagnostics?: ImportDiagnostic[]): MorphShape | null =>
    createSwfMorphShape(
      new SwfReader(source, start, end),
      version,
      (fillCharacterId, repeat, smoothed) => acquireSwfImageTexture(state, fillCharacterId, repeat, smoothed),
      diagnostics,
    );
  if (decode(state.diagnostics) === null) {
    // The character is simply absent from the document afterwards, so without this the loss has no
    // signal at all: a placement of it resolves to nothing and the import still reports success.
    reportImportDiagnostic(
      state.diagnostics,
      ImportDiagnosticSeverity.Drop,
      'swf.morph-shape-undecodable',
      'readSwfMorphShapeBody',
      { capability: version === 2 ? 'swf.morph.define-morph-shape-2' : 'swf.morph.define-morph-shape', characterId },
    );
    return;
  }
  state.morphShapes.set(characterId, decode);
}

function resolveSwfShapeVersion(code: number): number {
  if (code === TAG_DEFINE_SHAPE) return 1;
  if (code === TAG_DEFINE_SHAPE_2) return 2;
  if (code === TAG_DEFINE_SHAPE_3) return 3;
  return code === TAG_DEFINE_SHAPE_4 ? 4 : 0;
}

function resolveSwfMorphShapeVersion(code: number): number {
  if (code === TAG_DEFINE_MORPH_SHAPE) return 1;
  return code === TAG_DEFINE_MORPH_SHAPE_2 ? 2 : 0;
}

function createSwfShapeNode(template: Readonly<Shape>, bounds: SwfTagRectangle | null): Shape {
  const target = createShape();
  copyShapeCommands(target, template);
  applySwfAuthoredBounds(target, bounds);
  return target;
}

// Each placement of a shape character gets its own copy of the decoded commands, so a document that places
// one symbol many times still holds independently editable geometry per instance.
// Builds the nine-slice node a scaling-grid sprite becomes, or null when the sprite is not one this can
// express. Flash hangs the grid on a sprite, but Flight's nine-slice lives on the shape whose commands get
// remapped, so the two only meet where the sprite is a wrapper: one frame placing one unnamed, unmasked
// shape at identity, which is what an authoring tool emits when a designer sets scale9Grid on artwork.
// Returning null leaves the sprite an ordinary MovieClip — the grid is dropped rather than misapplied,
// because a grid on a multi-frame or multi-layer sprite means something this node cannot honor.
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
