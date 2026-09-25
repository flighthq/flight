import { reportImportDiagnostic } from '@flighthq/importdiagnostics/contract';
import type {
  ImportDiagnostic,
  Node2D,
  RichText,
  SwfTagHandler,
  SwfTagParseResult,
  SwfTagRectangle,
} from '@flighthq/types/contract';
import { ImportDiagnosticSeverity, RichTextKind } from '@flighthq/types/contract';

import { readSwfBoundedDefinitionHeader } from './swfBoundedDefinition';
import { readSwfEditTextFactory } from './swfEditText';
import { applySwfAuthoredBounds } from './swfNode';
import { SwfReader } from './swfReader';

const TAG_DEFINE_EDIT_TEXT = 37;

export const swfEditTextHandler: SwfTagHandler = {
  instantiate: {
    producesKinds: [RichTextKind],
    createPlacementNode(parsed, characterId, bounds, diagnostics) {
      const editText = parsed.editTexts.get(characterId);
      if (editText !== undefined) return createSwfEditTextTarget(editText, parsed, bounds, diagnostics);
      return null;
    },
    hasPlacementContent(parsed, characterId) {
      return parsed.editTexts.has(characterId);
    },
  },
  tags: [TAG_DEFINE_EDIT_TEXT],
  parse(body, _tag, state) {
    const characterId = readSwfBoundedDefinitionHeader(body, state, false);
    if (characterId === 0) return false;
    const reader = new SwfReader(body.source, body.pos, body.end);
    const bounds = state.characterBounds.get(characterId);
    const factory = readSwfEditTextFactory(reader, bounds?.width ?? 0, bounds?.height ?? 0);
    if (factory === null) {
      reportImportDiagnostic(
        state.diagnostics,
        ImportDiagnosticSeverity.Drop,
        'swf.edit-text-unparseable',
        'readSwfBoundedDefinition',
        { capability: 'swf.text.define-edit-text', characterId },
      );
    } else {
      state.editTexts.set(characterId, factory);
    }
    return true;
  },
};

function createSwfEditTextTarget(
  create: (resolveFontName: (fontId: number) => string) => RichText,
  parsed: Readonly<SwfTagParseResult>,
  bounds: SwfTagRectangle | null,
  diagnostics?: ImportDiagnostic[],
): Node2D {
  const unresolved = new Set<number>();
  const node = create((fontId) => {
    const name = parsed.fontNames.get(fontId);
    if (name !== undefined) return name;
    if (!unresolved.has(fontId)) {
      unresolved.add(fontId);
      reportImportDiagnostic(
        diagnostics,
        ImportDiagnosticSeverity.Drop,
        'swf.edit-text-font-name-unresolved',
        'createSwfEditTextTarget',
        { capability: 'swf.text.define-edit-text', fontId },
      );
    }
    return '';
  });
  applySwfAuthoredBounds(node, bounds);
  return node;
}
