import { reportImportDiagnostic } from '@flighthq/importdiagnostics/contract';
import type {
  SwfTagFamily,
  SwfTagParseState,
  SwfTagReader,
  SwfTagTimelineState,
  SwfTimeline,
} from '@flighthq/types/contract';
import { ImportDiagnosticSeverity } from '@flighthq/types/contract';

import { readSwfAbcFrameScripts, readSwfFrameActions } from './swfFrameAction';
import { SwfReader } from './swfReader';

// Timeline scripts, in both virtual machines' forms. Parsing only stashes bytes; the recognition work —
// and with it the whole AVM2 bytecode reader — happens in `resolve`, because a script binds to a
// character through a SymbolClass tag that may be read after it.

// The tag codes this family claims. Declared above the family value rather than at the foot of
// the file because the value reads them when the module initializes.
const TAG_DO_ABC = 82;
const TAG_DO_ABC_ANONYMOUS = 72;
const TAG_DO_ACTION = 12;
const TAG_DO_INIT_ACTION = 59;

export const swfScriptTagFamily: SwfTagFamily = {
  tags: [TAG_DO_ABC, TAG_DO_ABC_ANONYMOUS, TAG_DO_ACTION, TAG_DO_INIT_ACTION],
  parse(body, tag, state, timeline) {
    if (tag === TAG_DO_ABC || tag === TAG_DO_ABC_ANONYMOUS) {
      state.abcBlobs.push({ bytes: readSwfAbcPayload(body, tag === TAG_DO_ABC), named: tag === TAG_DO_ABC });
      return true;
    }
    if (tag === TAG_DO_INIT_ACTION) return readSwfInitAction(body, state);
    return readSwfDoAction(body, state, timeline);
  },
  resolve(state, timeline) {
    appendSwfAbcFrameScripts(state, timeline);
    // An init action names the sprite it belongs to, which may be defined after it.
    for (const pending of state.pendingInitActions) {
      const sprite = state.sprites.get(pending.characterId);
      if (sprite !== undefined && !sprite.actions.has(1)) sprite.actions.set(1, pending.script);
    }
  },
};

// Reads one tag stream — the root's or a sprite's — into frames and labels. The stream is complete when
// it reaches its bounded end, whether or not an explicit End tag arrived: real files written by Flash's
// own tooling end a sprite, and sometimes the root, with the last content tag and no terminator, and
// rejecting those loses the whole document over a byte no reader needs. Truncation is still caught, by
// the declared file length, by a tag body reaching past the stream, and by the reader's own overrun flag.
// Composes every static text definition once the whole file has been walked, so a text record can address
// a font declared after it. A text whose body does not decode keeps its bounded placeholder, the same way
// an unreadable shape body does.
// A DoABC payload names itself before its bytecode: the tag carries flags and a null-terminated name that
// the anonymous form omits.
function readSwfAbcPayload(body: SwfTagReader, hasName: boolean): Uint8Array {
  if (!hasName) return body.source.subarray(body.pos, body.end);
  let start = body.pos + 4;
  while (start < body.end && body.source[start] !== 0) start++;
  return body.source.subarray(Math.min(start + 1, body.end), body.end);
}

// Binds recognized AVM2 frame scripts to the timelines they belong to. A script declares them against a
// class name; SymbolClass is what ties that name back to a character, and character 0 is the root.
function appendSwfAbcFrameScripts(state: SwfTagParseState, timeline: SwfTimeline): void {
  if (state.abcBlobs.length === 0) return;
  const charactersByClass = new Map<string, number>();
  for (const [characterId, className] of state.linkages) charactersByClass.set(className, characterId);

  for (const blob of state.abcBlobs) {
    const byClass = readSwfAbcFrameScripts(blob.bytes, state.diagnostics);
    if (byClass === null) {
      reportImportDiagnostic(
        state.diagnostics,
        ImportDiagnosticSeverity.Drop,
        'swf.abc-frame-scripts-unreadable',
        'appendSwfAbcFrameScripts',
        { capability: blob.named ? 'swf.script.do-abc' : 'swf.script.do-abc-anonymous' },
      );
      continue;
    }
    for (const [className, frames] of byClass) {
      const characterId = charactersByClass.get(className);
      if (characterId === undefined) continue;
      const target = characterId === 0 ? timeline : state.sprites.get(characterId);
      if (target === undefined) continue;
      for (const [frame, script] of frames) target.actions.set(frame, script);
    }
  }
}

// DoAction carries the current frame's script inline.
function readSwfDoAction(body: SwfTagReader, state: SwfTagParseState, timeline: SwfTagTimelineState): boolean {
  const script = readSwfFrameActions(new SwfReader(body.source, body.pos, body.end));
  if (script !== null) {
    timeline.actions.set(timeline.frames.length + 1, script);
  } else {
    reportImportDiagnostic(
      state.diagnostics,
      ImportDiagnosticSeverity.Skip,
      'swf.frame-script-declined',
      'readSwfTimeline',
      { capability: 'swf.script.do-action', frame: timeline.frames.length + 1 },
    );
  }
  return true;
}

// DoInitAction names the sprite whose first frame the script belongs to, which may be defined after it.
function readSwfInitAction(body: SwfTagReader, state: SwfTagParseState): boolean {
  const spriteId = body.readUint16();
  const script = readSwfFrameActions(new SwfReader(body.source, body.pos, body.end));
  if (script === null) {
    reportImportDiagnostic(
      state.diagnostics,
      ImportDiagnosticSeverity.Skip,
      'swf.frame-script-declined',
      'readSwfTimeline',
      { capability: 'swf.script.do-init-action', characterId: spriteId },
    );
  } else {
    state.pendingInitActions.push({ characterId: spriteId, script });
  }
  return true;
}
