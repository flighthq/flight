import { reportImportDiagnostic } from '@flighthq/importdiagnostics/contract';
import type {
  ImportDiagnostic,
  MorphShape,
  SwfTagHandler,
  SwfTagParseState,
  SwfTagReader,
} from '@flighthq/types/contract';
import { ImportDiagnosticSeverity, MorphShapeKind } from '@flighthq/types/contract';

import { readSwfBoundedDefinitionHeader } from './swfBoundedDefinition';
import { acquireSwfImageTexture } from './swfImageTexture';
import { createSwfMorphShape } from './swfMorphShape';
import { createSwfMorphShapeTarget } from './swfNode';
import { SwfReader } from './swfReader';

const TAG_DEFINE_MORPH_SHAPE = 46;

const TAG_DEFINE_MORPH_SHAPE_2 = 84;

export const swfDefineMorphShapeHandler: SwfTagHandler = {
  instantiate: {
    producesKinds: [MorphShapeKind],
    createPlacementNode(parsed, characterId, bounds) {
      const morphShape = parsed.morphShapes.get(characterId);
      if (morphShape === undefined) return null;
      return createSwfMorphShapeTarget(morphShape, bounds, parsed.morphBounds.get(characterId));
    },
    hasPlacementContent(parsed, characterId) {
      return parsed.morphShapes.has(characterId);
    },
  },
  tags: [TAG_DEFINE_MORPH_SHAPE, TAG_DEFINE_MORPH_SHAPE_2],
  parse(body, tag, state) {
    const morphVersion = resolveSwfMorphShapeVersion(tag);
    const characterId = readSwfBoundedDefinitionHeader(body, state, true);
    if (characterId === 0) return false;
    readSwfMorphShapeBody(body, state, characterId, morphVersion);
    return true;
  },
};

function readSwfMorphShapeBody(
  body: SwfTagReader,
  state: SwfTagParseState,
  characterId: number,
  version: number,
): void {
  const source = body.source;
  const start = body.pos;
  const end = body.end;
  const decode = (diagnostics?: ImportDiagnostic[]): MorphShape | null =>
    createSwfMorphShape(
      new SwfReader(source, start, end),
      version,
      (fillCharacterId, repeat, smoothed) => acquireSwfImageTexture(state, fillCharacterId, repeat, smoothed),
      diagnostics,
    );
  if (decode(state.diagnostics) === null) {
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

function resolveSwfMorphShapeVersion(code: number): number {
  if (code === TAG_DEFINE_MORPH_SHAPE) return 1;
  return code === TAG_DEFINE_MORPH_SHAPE_2 ? 2 : 0;
}
