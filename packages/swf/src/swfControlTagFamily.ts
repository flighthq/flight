import { reportImportDiagnostic } from '@flighthq/importdiagnostics/contract';
import type {
  FrameScript,
  ImportDiagnostic,
  SwfTagFamily,
  SwfTagParseState,
  SwfTagPlacement,
  SwfTagReader,
  TimelineLabel,
} from '@flighthq/types/contract';
import { BlendMode, ImportDiagnosticSeverity } from '@flighthq/types/contract';

import { EMPTY_ADJUSTMENTS, EMPTY_EFFECTS, readSwfColorTransform } from './swfAppearance';
import { readSwfMatrix, readSwfRectangle } from './swfPrimitive';
import { SwfReader } from './swfReader';
import { addSwfTimelineLabel } from './swfTimelineParse';

// The tags that describe the document rather than draw it: the stage colour, frame labels and scene
// tables, the linkage names that publish a character to code, the nine-slice splitter, and buttons —
// whose up state is expressed as a one-frame timeline so it instantiates through the same path a sprite
// does rather than needing a node kind of its own.

// The tag codes this family claims. Declared above the family value rather than at the foot of
// the file because the value reads them when the module initializes.
const TAG_DEFINE_BUTTON = 7;
const TAG_DEFINE_BUTTON_2 = 34;
const TAG_DEFINE_SCALING_GRID = 78;
const TAG_DEFINE_SCENE_AND_FRAME_LABEL_DATA = 86;
const TAG_EXPORT_ASSETS = 56;
const TAG_FRAME_LABEL = 43;
const TAG_SET_BACKGROUND_COLOR = 9;
const TAG_SYMBOL_CLASS = 76;

export const swfControlTagFamily: SwfTagFamily = {
  tags: [
    TAG_SET_BACKGROUND_COLOR,
    TAG_FRAME_LABEL,
    TAG_DEFINE_SCENE_AND_FRAME_LABEL_DATA,
    TAG_DEFINE_SCALING_GRID,
    TAG_EXPORT_ASSETS,
    TAG_SYMBOL_CLASS,
    TAG_DEFINE_BUTTON,
    TAG_DEFINE_BUTTON_2,
  ],
  parse(body, tag, state, timeline) {
    if (tag === TAG_SET_BACKGROUND_COLOR) readSwfBackgroundColor(body, state);
    else if (tag === TAG_FRAME_LABEL)
      addSwfTimelineLabel(timeline.labels, timeline.frames.length + 1, body.readString());
    else if (tag === TAG_DEFINE_SCENE_AND_FRAME_LABEL_DATA) {
      readSwfSceneAndFrameLabelData(body, timeline.labels, state.diagnostics);
    } else if (tag === TAG_DEFINE_SCALING_GRID) readSwfScalingGrid(body, state);
    else if (tag === TAG_EXPORT_ASSETS || tag === TAG_SYMBOL_CLASS) readSwfLinkages(body, state.linkages);
    else readSwfButtonDefinition(body, state, tag === TAG_DEFINE_BUTTON_2 ? 2 : 1);
    return true;
  },
};

function readSwfBackgroundColor(body: SwfTagReader, state: SwfTagParseState): void {
  const red = body.readUint8();
  const green = body.readUint8();
  const blue = body.readUint8();
  if (!body.valid) return;
  state.backgroundColor = red * 0x1000000 + green * 0x10000 + blue * 0x100 + 0xff;
}

// DefineSceneAndFrameLabelData carries the whole root timeline's scene and label tables in one record, so
// a file that uses it declares no FrameLabel tags. Its frame offsets are zero-based. The scene table is
// read to reach the label table that follows it; scene names are a separate authoring concept from a frame
// label and are not imported as one.
// DefineScalingGrid names the sprite it applies to and the centre rectangle of that sprite's nine-slice
// grid. The tag can precede or follow the sprite it names, so this only records the pair; instantiation
// decides what a grid can be applied to.
function readSwfScalingGrid(body: SwfTagReader, state: SwfTagParseState): void {
  const characterId = body.readUint16();
  const splitter = readSwfRectangle(body);
  if (!body.valid || characterId === 0 || splitter === null) return;
  state.scalingGrids.set(characterId, splitter);
}

function readSwfSceneAndFrameLabelData(
  body: SwfTagReader,
  labels: TimelineLabel[],
  diagnostics: ImportDiagnostic[] | undefined,
): void {
  const sceneCount = body.readEncodedUint32();
  for (let i = 0; i < sceneCount && body.valid; i++) {
    body.readEncodedUint32();
    body.readString();
  }
  // Scene names are read past to reach the label table behind them. Skip rather than Drop: Flight has
  // frame labels but no subject for a named frame range, so this is a capability gap rather than data
  // this decoder failed to read.
  if (sceneCount > 0) {
    reportImportDiagnostic(
      diagnostics,
      ImportDiagnosticSeverity.Skip,
      'swf.scene-names',
      'readSwfSceneAndFrameLabelData',
      {
        capability: 'swf.timeline.define-scene-and-frame-label-data',
        sceneCount,
      },
    );
  }
  const labelCount = body.readEncodedUint32();
  for (let i = 0; i < labelCount && body.valid; i++) {
    const frame = body.readEncodedUint32();
    const name = body.readString();
    if (body.valid) addSwfTimelineLabel(labels, frame + 1, name);
  }
}

function readSwfLinkages(body: SwfTagReader, linkages: Map<number, string>): void {
  const count = body.readUint16();
  for (let i = 0; i < count && body.valid; i++) {
    const characterId = body.readUint16();
    const name = body.readString();
    if (name) linkages.set(characterId, name);
  }
}

// The stage colour, as an RGB record. SWF gives it no alpha, and a stage is opaque, so it packs to fully
// opaque RGBA. Last declaration wins, matching how a player applies the most recent one it has read.
// A button is a display character whose content is a small display list per interaction state. A document
// is a still scene, so the up state is what it holds — the same thing a player shows before any pointer
// touches it — and the other states are dropped rather than layered invisibly on top of one another.
//
// The up state is expressed as a one-frame timeline, so a button instantiates, bounds, nests, and masks
// through exactly the same path a sprite does and needs no separate node kind.
function readSwfButtonDefinition(body: SwfTagReader, state: SwfTagParseState, version: number): void {
  const reader = new SwfReader(body.source, body.pos, body.end);
  const buttonId = reader.readUint16();
  if (version === 2) {
    reader.readUint8();
    reader.readUint16();
  }
  if (!reader.valid || buttonId === 0 || state.definedCharacters.has(buttonId)) return;

  const placements = new Map<number, SwfTagPlacement>();
  for (let records = 0; records < MAX_BUTTON_RECORDS; records++) {
    const flags = reader.readUint8();
    if (!reader.valid) return;
    if (flags === 0) break;

    const characterId = reader.readUint16();
    const depth = reader.readUint16();
    const matrix = readSwfMatrix(reader);
    const colorTransform = version === 2 ? readSwfColorTransform(reader) : null;
    if (!reader.valid) return;
    if ((flags & BUTTON_STATE_UP) === 0 && characterId !== 0) {
      // A document is a still scene, so only the up state is held. The other states are a real capability
      // gap rather than data this decoder could not read, which is why they Skip rather than Drop.
      reportImportDiagnostic(
        state.diagnostics,
        ImportDiagnosticSeverity.Skip,
        'swf.button-interaction-state',
        'readSwfButtonDefinition',
        {
          characterId,
          flags,
        },
      );
    }
    if ((flags & BUTTON_STATE_UP) !== 0 && characterId !== 0) {
      placements.set(depth, {
        advancedBlendMode: null,
        alpha: colorTransform?.alpha ?? 1,
        blendMode: BlendMode.Normal,
        characterId,
        clipDepth: 0,
        colorAdjustments: colorTransform?.colorAdjustments ?? null,
        colorTransformAdjustments: colorTransform?.colorAdjustments ?? null,
        depth,
        directLinkage: null,
        effects: EMPTY_EFFECTS,
        filterAdjustments: EMPTY_ADJUSTMENTS,
        matrix,
        name: null,
        ratio: 0,
      });
    }
    // A filter list has no fixed width, so a record carrying one would desynchronize every record after
    // it. Stopping keeps what was read rather than misreading the rest.
    if ((flags & BUTTON_HAS_FILTER_LIST) !== 0) break;
    if ((flags & BUTTON_HAS_BLEND_MODE) !== 0) reader.readUint8();
  }

  state.definedCharacters.add(buttonId);
  // A button's up state is a still one-frame display list; nothing about it is edge-triggered.
  state.sprites.set(buttonId, { actions: new Map<number, FrameScript>(), cues: [], frames: [placements], labels: [] });
}

const BUTTON_HAS_BLEND_MODE = 0x20;

const BUTTON_HAS_FILTER_LIST = 0x10;

const BUTTON_STATE_UP = 0x01;

const MAX_BUTTON_RECORDS = 10_000;
