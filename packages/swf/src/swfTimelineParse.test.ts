import { collectImportDiagnostics } from '@flighthq/importdiagnostics/contract';
import type { ImportDiagnostic, SwfTagFamily, SwfTimeline, TimelineLabel } from '@flighthq/types/contract';
import { ImportDiagnosticSeverity } from '@flighthq/types/contract';

import { swfControlTagFamily } from './swfControlTagFamily';
import { swfPlacementTagFamily } from './swfPlacementTagFamily';
import { SwfReader } from './swfReader';
import { createSwfTagFamilyDispatch } from './swfTagFamilyDispatch';
import { createSwfTestParseState, createTag, joinBytes, uint16 } from './swfTagStreamTestHelper';
import { addSwfTimelineLabel, readSwfTimeline } from './swfTimelineParse';

describe('addSwfTimelineLabel', () => {
  it('appends a label at the given frame', () => {
    const labels: TimelineLabel[] = [];
    addSwfTimelineLabel(labels, 3, 'intro');
    expect(labels).toEqual([{ frame: 3, name: 'intro' }]);
  });

  // DefineSceneAndFrameLabelData and FrameLabel can both name the same frame in one file, so the same
  // pair arriving twice is ordinary rather than a defect worth reporting.
  it('ignores an exact repeat of a pair it already holds', () => {
    const labels: TimelineLabel[] = [];
    addSwfTimelineLabel(labels, 3, 'intro');
    addSwfTimelineLabel(labels, 3, 'intro');
    expect(labels).toHaveLength(1);
  });

  it('keeps a second name on the same frame, and the same name on another frame', () => {
    const labels: TimelineLabel[] = [];
    addSwfTimelineLabel(labels, 3, 'intro');
    addSwfTimelineLabel(labels, 3, 'start');
    addSwfTimelineLabel(labels, 9, 'intro');
    expect(labels).toHaveLength(3);
  });

  it('ignores an empty name', () => {
    const labels: TimelineLabel[] = [];
    addSwfTimelineLabel(labels, 1, '');
    expect(labels).toEqual([]);
  });
});

describe('readSwfTimeline', () => {
  it('counts a frame per ShowFrame and snapshots the display list at each', () => {
    const timeline = read([
      place(1, 7),
      createTag(TAG_SHOW_FRAME),
      place(2, 8),
      createTag(TAG_SHOW_FRAME),
      createTag(TAG_END),
    ])!;
    expect(timeline.frames).toHaveLength(2);
    expect([...timeline.frames[0].keys()]).toEqual([1]);
    // Frames are complete snapshots rather than authored deltas, so a seek is a lookup and never a replay.
    expect([...timeline.frames[1].keys()]).toEqual([1, 2]);
  });

  it('ends at the bounded end when a stream carries no End tag', () => {
    // Real files written by Flash's own tooling end a sprite, and sometimes the root, with the last
    // content tag and no terminator; rejecting those loses the document over a byte no reader needs.
    const timeline = read([place(1, 7), createTag(TAG_SHOW_FRAME)])!;
    expect(timeline.frames).toHaveLength(1);
  });

  it('stops at End and ignores every tag after it', () => {
    const timeline = read([createTag(TAG_SHOW_FRAME), createTag(TAG_END), createTag(TAG_SHOW_FRAME)])!;
    expect(timeline.frames).toHaveLength(1);
  });

  it('gives a stream with no ShowFrame a single frame', () => {
    expect(read([place(1, 7), createTag(TAG_END)])!.frames).toHaveLength(1);
  });

  it('returns the sentinel for a tag body reaching past the stream', () => {
    // A 0x3f short length means an extended uint32 length follows; declaring more than the stream holds
    // is the truncation case the bounded end catches.
    const truncated = joinBytes(uint16((TAG_SET_BACKGROUND_COLOR << 6) | 0x3f), new Uint8Array([64, 0, 0, 0]));
    expect(read([truncated])).toBeNull();
  });

  // A skipped body has to be skipped by its length prefix or every record after it is misread.
  it('skips a tag no registered family claims and keeps the stream aligned', () => {
    const opaque = new Uint8Array(120).fill(0xff);
    const diagnostics = collectImportDiagnostics((sink) => {
      const timeline = read(
        [createTag(TAG_DO_ABC, opaque), place(1, 7), createTag(TAG_SHOW_FRAME), createTag(TAG_END)],
        sink,
      )!;
      expect([...timeline.frames[0].keys()]).toEqual([1]);
    });
    expect(diagnostics.map((entry) => entry.kind)).toEqual(['swf.tag-handler-unregistered']);
  });

  it('tells an unknown tag code apart from a known one nothing registered', () => {
    const diagnostics = collectImportDiagnostics((sink) => {
      read([createTag(TAG_UNKNOWN, new Uint8Array([1, 2, 3])), createTag(TAG_END)], sink);
    });
    expect(diagnostics).toMatchObject([
      { detail: { tag: TAG_UNKNOWN }, kind: 'swf.tag-unknown', severity: ImportDiagnosticSeverity.Skip },
    ]);
  });

  it('skips unclaimed payloads with no diagnostics collector engaged', () => {
    expect(read([createTag(TAG_UNKNOWN, new Uint8Array([1, 2, 3])), createTag(TAG_END)])).not.toBeNull();
  });

  it('returns the sentinel when a family declares the stream unwalkable', () => {
    const refusing: SwfTagFamily = { tags: [TAG_SET_BACKGROUND_COLOR], parse: () => false };
    const state = createSwfTestParseState(createSwfTagFamilyDispatch({ control: refusing }));
    const bytes = joinBytes(createTag(TAG_SET_BACKGROUND_COLOR, new Uint8Array([1, 2, 3])), createTag(TAG_END));
    expect(readSwfTimeline(new SwfReader(bytes, 0, bytes.length), state)).toBeNull();
  });

  // The budget is what a document has left to spend on whole-display-list snapshots, shared across the
  // root and every sprite in it, so a file cannot multiply one display list by a million ShowFrames.
  it('returns the sentinel when the frame-entry budget is exhausted', () => {
    const state = createSwfTestParseState(DISPATCH);
    state.remainingFrameEntries = 1;
    const bytes = joinBytes(place(1, 7), createTag(TAG_SHOW_FRAME), createTag(TAG_SHOW_FRAME), createTag(TAG_END));
    expect(readSwfTimeline(new SwfReader(bytes, 0, bytes.length), state)).toBeNull();
  });

  it('drops a label past the last frame, and reports how many', () => {
    const diagnostics = collectImportDiagnostics((sink) => {
      const timeline = read([createTag(TAG_SHOW_FRAME), sceneLabelAt(40, 'late'), createTag(TAG_END)], sink)!;
      expect(timeline.labels).toEqual([]);
    });
    // The scene table itself is reported as declined; the label past the last frame is the second entry,
    // and its count is the only thing that separates a short label table from a complete one.
    expect(diagnostics.map((entry) => entry.kind)).toEqual(['swf.scene-names', 'swf.label-past-last-frame']);
    expect(diagnostics[1]).toMatchObject({ detail: { dropped: 1, frames: 1 } });
  });

  it('sorts reachable labels by frame', () => {
    const timeline = read([
      createTag(TAG_SHOW_FRAME),
      createTag(TAG_FRAME_LABEL, name('second')),
      createTag(TAG_SHOW_FRAME),
      createTag(TAG_END),
    ])!;
    expect(timeline.labels.map((label) => label.frame)).toEqual([2]);
  });
});

function read(tags: readonly Uint8Array[], diagnostics?: ImportDiagnostic[]): SwfTimeline | null {
  const state = { ...createSwfTestParseState(DISPATCH), diagnostics };
  const bytes = joinBytes(...tags);
  return readSwfTimeline(new SwfReader(bytes, 0, bytes.length), state);
}

function name(text: string): Uint8Array {
  return new Uint8Array([...[...text].map((character) => character.charCodeAt(0)), 0]);
}

function place(depth: number, characterId: number): Uint8Array {
  return createTag(TAG_PLACE_OBJECT_2, joinBytes(new Uint8Array([0x02]), uint16(depth), uint16(characterId)));
}

function sceneLabelAt(frame: number, text: string): Uint8Array {
  // DefineSceneAndFrameLabelData: one scene at frame 0, then one frame label, both zero-based.
  return createTag(
    TAG_DEFINE_SCENE_AND_FRAME_LABEL_DATA,
    joinBytes(new Uint8Array([1, 0]), name('scene'), new Uint8Array([1, frame]), name(text)),
  );
}

const DISPATCH = createSwfTagFamilyDispatch({ control: swfControlTagFamily, placement: swfPlacementTagFamily });
const TAG_DEFINE_SCENE_AND_FRAME_LABEL_DATA = 86;
const TAG_DO_ABC = 82;
const TAG_END = 0;
const TAG_FRAME_LABEL = 43;
const TAG_PLACE_OBJECT_2 = 26;
const TAG_SET_BACKGROUND_COLOR = 9;
const TAG_SHOW_FRAME = 1;
const TAG_UNKNOWN = 100;
