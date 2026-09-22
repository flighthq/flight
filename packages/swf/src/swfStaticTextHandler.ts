import { reportImportDiagnostic } from '@flighthq/importdiagnostics/contract';
import type { SwfTagHandler, SwfTagParseState } from '@flighthq/types/contract';
import { ImportDiagnosticSeverity } from '@flighthq/types/contract';

import { readSwfBoundedDefinitionHeader } from './swfBoundedDefinition';
import { readSwfMatrix } from './swfPrimitive';
import { SwfReader } from './swfReader';
import { createSwfTextShape } from './swfText';

const TAG_DEFINE_TEXT = 11;
const TAG_DEFINE_TEXT_2 = 33;

export const swfStaticTextHandler: SwfTagHandler = {
  tags: [TAG_DEFINE_TEXT, TAG_DEFINE_TEXT_2],
  parse(body, tag, state) {
    const characterId = readSwfBoundedDefinitionHeader(body, state, false);
    if (characterId === 0) return false;
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
