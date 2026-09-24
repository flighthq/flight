import { reportImportDiagnostic } from '@flighthq/importdiagnostics/contract';
import type {
  FrameScript,
  ImportDiagnostic,
  SwfTagHandler,
  SwfTagHandlerDispatch,
  SwfTagParseState,
  SwfTagPlacement,
  SwfTagTimelineState,
  TimelineLabel,
  SwfTimeline,
} from '@flighthq/types/contract';
import { ImportDiagnosticSeverity } from '@flighthq/types/contract';

import { isKnownSwfTag } from './swfKnownTags';
import { SwfReader } from './swfReader';
import { SWF_NON_CONTENT_TAGS } from './swfTagVocabulary';

// The tag walk itself: one flat lookup per tag, and a length-prefixed skip for every tag no registered
// family claims. It is deliberately the only module that knows how a tag stream is framed, so the root
// and every nested sprite body walk through exactly the same code with exactly the same registry.

export function addSwfTimelineLabel(labels: TimelineLabel[], frame: number, name: string): void {
  if (!name || labels.some((label) => label.frame === frame && label.name === name)) return;
  labels.push({ frame, name });
}

// A registry miss has three different remedies, so it has three different outcomes: a deliberately
// declined capability keeps its specific diagnostic, a known content tag can be restored by installing
// its handler, and an unknown tag cannot be handled until this package learns its identity. Metadata that
// costs no scene content stays silent. The reader has already advanced to bodyEnd before this function is
// called, so every outcome preserves the tag stream alignment without inspecting the payload.
function reportSwfUnhandledTag(diagnostics: ImportDiagnostic[] | undefined, code: number): void {
  // The no-collector path does no vocabulary lookup and allocates no diagnostic detail.
  if (diagnostics === undefined) return;
  const declinedKind = SWF_DECLINED_TAG_KINDS.get(code);
  if (declinedKind !== undefined) {
    const capability = SWF_DECLINED_TAG_CAPABILITIES.get(code);
    reportImportDiagnostic(
      diagnostics,
      ImportDiagnosticSeverity.Skip,
      declinedKind,
      'readSwfTimeline',
      capability === undefined ? { tag: code } : { capability, tag: code },
    );
    return;
  }
  if (SWF_NON_CONTENT_TAGS.has(code)) return;

  const kind = isKnownSwfTag(code) ? 'swf.tag-handler-unregistered' : 'swf.tag-unknown';
  reportImportDiagnostic(diagnostics, ImportDiagnosticSeverity.Skip, kind, 'readSwfTimeline', { tag: code });
}

// Reads one tag stream — the root's or a sprite's — into frames and labels, dispatching each tag to the
// family that claimed it. A tag no registered family claims costs its length prefix and nothing else:
// the reader has already advanced to the end of the body before the miss is even noticed, which is what
// lets a build read a document containing capabilities it did not link.
//
// The stream is complete when it reaches its bounded end, whether or not an explicit End tag arrived:
// real files written by Flash's own tooling end a sprite, and sometimes the root, with the last content
// tag and no terminator, and rejecting those loses the whole document over a byte no reader needs.
// Truncation is still caught, by the declared file length, by a tag body reaching past the stream, and
// by the reader's own overrun flag.
export function readSwfTimeline(reader: SwfReader, state: SwfTagParseState): SwfTimeline | null {
  const timeline: SwfTagTimelineState = {
    actions: new Map<number, FrameScript>(),
    cues: [],
    frames: [],
    labels: [],
    placements: new Map<number, SwfTagPlacement>(),
    streamChunks: [],
    streamFormat: -1,
    streamStartFrame: 1,
  };

  while (reader.pos < reader.end && reader.valid) {
    const tagHeader = reader.readUint16();
    const code = tagHeader >> 6;
    const shortLength = tagHeader & 0x3f;
    const length = shortLength === 0x3f ? reader.readUint32() : shortLength;
    const bodyEnd = reader.pos + length;
    if (!reader.valid || bodyEnd > reader.end) return null;

    const body = new SwfReader(reader.source, reader.pos, bodyEnd);
    reader.pos = bodyEnd;
    if (code === TAG_END) break;
    if (code === TAG_SHOW_FRAME) {
      state.remainingFrameEntries -= timeline.placements.size + 1;
      if (state.remainingFrameEntries < 0) return null;
      timeline.frames.push(new Map(timeline.placements));
    } else {
      const family = state.dispatch.get(code);
      if (family !== undefined) {
        if (!family.parse(body, code, state, timeline, state.diagnostics)) return null;
      } else {
        reportSwfUnhandledTag(state.diagnostics, code);
      }
    }
    if (!body.valid) return null;
  }

  if (!reader.valid) return null;
  if (timeline.frames.length === 0) timeline.frames.push(timeline.placements);
  // Per-timeline completion, for state a nested timeline accumulates on its own — the stream audio
  // blocks interleaved with its frames are the one case today. A family the build left out contributes
  // nothing, so the state it would have filled is empty and this loop is the only thing that ran.
  for (const family of collectSwfTimelineFinishers(state.dispatch)) family.finishTimeline?.(state, timeline);
  const reachableCues = timeline.cues.filter((cue) => cue.frame <= timeline.frames.length);
  const reachableLabels = timeline.labels.filter((label) => label.frame <= timeline.frames.length);
  if (reachableLabels.length !== timeline.labels.length) {
    reportImportDiagnostic(
      state.diagnostics,
      ImportDiagnosticSeverity.Drop,
      'swf.label-past-last-frame',
      'readSwfTimeline',
      {
        capability: 'swf.timeline.frame-label',
        dropped: timeline.labels.length - reachableLabels.length,
        frames: timeline.frames.length,
      },
    );
  }
  if (reachableCues.length !== timeline.cues.length) {
    reportImportDiagnostic(
      state.diagnostics,
      ImportDiagnosticSeverity.Drop,
      'swf.cue-past-last-frame',
      'readSwfTimeline',
      {
        dropped: timeline.cues.length - reachableCues.length,
        frames: timeline.frames.length,
      },
    );
  }
  return {
    actions: timeline.actions,
    cues: reachableCues,
    frames: timeline.frames,
    labels: reachableLabels.sort(compareSwfTimelineLabelFrame),
  };
}

function compareSwfTimelineLabelFrame(a: Readonly<TimelineLabel>, b: Readonly<TimelineLabel>): number {
  return a.frame - b.frame;
}

// The declared capability a declined tag costs, where one exists. Deliberately partial: `DefineFont4`,
// `DefineBinaryData`, `ImportAssets` and `DefineButtonSound` name no declared capability, and inventing
// one so every crumb could carry a join key would put entries in the denominator that nothing measures.
const SWF_DECLINED_TAG_CAPABILITIES = new Map<number, string>([[61, 'swf.video.video-frame']]);

const SWF_DECLINED_TAG_KINDS = new Map<number, string>([
  [17, 'swf.define-button-sound'],
  [57, 'swf.import-assets'],
  [61, 'swf.video-frame-payload'],
  [71, 'swf.import-assets'],
  [87, 'swf.define-binary-data'],
  [91, 'swf.define-font-4'],
]);

const TAG_END = 0;

const TAG_SHOW_FRAME = 1;

export const MAX_TIMELINE_FRAME_ENTRIES = 1_000_000;

// The distinct families behind a dispatch table, for the phases that run once per family rather than
// once per tag. A family claims several tag codes, so the table names it more than once.
function collectSwfTimelineFinishers(dispatch: SwfTagHandlerDispatch): Set<Readonly<SwfTagHandler>> {
  const families = new Set<Readonly<SwfTagHandler>>();
  for (const family of dispatch.values()) {
    if (family.finishTimeline !== undefined) families.add(family);
  }
  return families;
}
