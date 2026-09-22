import { reportImportDiagnostic } from '@flighthq/importdiagnostics/contract';
import type {
  ImportDiagnostic,
  Node2D,
  RichText,
  SwfTagFamily,
  SwfTagParseResult,
  SwfTagParseState,
  SwfTagRectangle,
} from '@flighthq/types/contract';
import { ImportDiagnosticSeverity } from '@flighthq/types/contract';

import { readSwfBoundedDefinitionHeader } from './swfBoundedDefinition';
import { readSwfEditTextFactory } from './swfEditText';
import { applySwfAuthoredBounds } from './swfNode';
import { readSwfMatrix } from './swfPrimitive';
import { SwfReader } from './swfReader';
import { createSwfTextShape } from './swfText';

// Static text and editable text fields. Composition is deferred to `resolve`: a text record addresses
// glyphs by index into a font that may be declared after it, so the record's bytes are queued at the tag
// and turned into geometry once the whole file has been walked.

// The tag codes this family claims. Declared above the family value rather than at the foot of
// the file because the value reads them when the module initializes.
const TAG_DEFINE_EDIT_TEXT = 37;
const TAG_DEFINE_TEXT = 11;
const TAG_DEFINE_TEXT_2 = 33;

export const swfTextTagFamily: SwfTagFamily = {
  instantiate: {
    createPlacementNode(parsed, characterId, bounds, diagnostics) {
      const editText = parsed.editTexts.get(characterId);
      if (editText !== undefined) return createSwfEditTextTarget(editText, parsed, bounds, diagnostics);
      // A composed static text is an ordinary Shape, which the shape family builds; this family owns only
      // the field, whose text is per-instance state rather than shared artwork.
      return null;
    },
    hasPlacementContent(parsed, characterId) {
      return parsed.editTexts.has(characterId);
    },
  },
  tags: [TAG_DEFINE_TEXT, TAG_DEFINE_TEXT_2, TAG_DEFINE_EDIT_TEXT],
  parse(body, tag, state) {
    const characterId = readSwfBoundedDefinitionHeader(body, state, false);
    if (characterId === 0) return false;
    if (tag === TAG_DEFINE_EDIT_TEXT) {
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
    }
    // Everything after the bounds and the definition matrix is the record stream, queued for `resolve`.
    const reader = new SwfReader(body.source, body.pos, body.end);
    readSwfMatrix(reader);
    if (reader.valid) {
      state.pendingTexts.push({
        characterId,
        end: body.end,
        source: body.source,
        start: reader.pos,
        version: tag === TAG_DEFINE_TEXT ? 1 : 2,
      });
    }
    return true;
  },
  resolve(state) {
    appendSwfPendingTextShapes(state);
  },
};

function appendSwfPendingTextShapes(state: SwfTagParseState): void {
  for (const pending of state.pendingTexts) {
    const shape = createSwfTextShape(
      new SwfReader(pending.source, pending.start, pending.end),
      pending.version,
      state.fontOutlineSources,
    );
    if (shape === null) {
      // Composition is deferred because the records address glyphs by index into a font that may not
      // have been read yet, so the failure lands here rather than at the tag. Without a report the
      // character is simply absent and every placement of it resolves to nothing.
      reportImportDiagnostic(
        state.diagnostics,
        ImportDiagnosticSeverity.Drop,
        'swf.text-shape-uncomposable',
        'appendSwfPendingTextShapes',
        {
          capability: pending.version === 2 ? 'swf.text.define-text-2' : 'swf.text.define-text',
          characterId: pending.characterId,
        },
      );
      continue;
    }
    state.shapes.set(pending.characterId, shape);
  }
}

// A field becomes its own node per placement, because its text is per-instance state rather than shared
// artwork. The authored RECT still sizes it, so a field reports the box the tool drew even before any
// layout has run.
function createSwfEditTextTarget(
  create: (resolveFontName: (fontId: number) => string) => RichText,
  parsed: Readonly<SwfTagParseResult>,
  bounds: SwfTagRectangle | null,
  diagnostics?: ImportDiagnostic[],
): Node2D {
  // The field survives with its size, box and colour and simply has no font family, which is the
  // diminished case: it exists, it is smaller than authored, and nothing else says so. Reported once per
  // unresolved id rather than per call, since the resolver runs for every run of text.
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
