import type { AnimationChannel } from './AnimationChannel';
import type { AttachmentSkin2D } from './AttachmentSkin2D';
import type { Bone2D } from './Bone2D';
import type { ByteReader } from './ByteReader';
import type { ImportDiagnostic } from './ImportDiagnostic';
import type { Skeleton2DDrawOrderTimeline } from './Skeleton2DDrawOrderTimeline';
import type { Skeleton2DImportAnimation } from './Skeleton2DImport';
import type { Slot2D } from './Slot2D';

// The sections Spine writes after its header and shared string table. Their order on the wire is fixed,
// but registration is keyed so an application can replace a built-in reader without editing the parser.
// The open string type also leaves room for a version-specific leaf parser to name an added section.
export const SpineBinarySectionKind = {
  Animations: 'animations',
  Bones: 'bones',
  Events: 'events',
  IkConstraints: 'ikConstraints',
  PathConstraints: 'pathConstraints',
  Skins: 'skins',
  Slots: 'slots',
  TransformConstraints: 'transformConstraints',
} as const;

export type SpineBinarySectionKind = string;

// The eight timeline families in each Spine animation record, in their source vocabulary. A handler owns
// one family as a whole; nested ordinals such as rotate/translate remain part of that family's wire reader.
export const SpineBinaryTimelineKind = {
  Bone: 'bone',
  Deform: 'deform',
  DrawOrder: 'drawOrder',
  Event: 'event',
  Ik: 'ik',
  Path: 'path',
  Slot: 'slot',
  Transform: 'transform',
} as const;

export type SpineBinaryTimelineKind = string;

// Mutable parse state shared by one section handler invocation. The byte reader and header-derived fields
// are the irreducible binary bedrock; handlers consume only the record family they registered for and
// append its modeled output to the same result under construction.
export interface SpineBinarySectionContext {
  animations: Skeleton2DImportAnimation[];
  attachmentNames: (string | null)[];
  bones: Bone2D[];
  diagnostics?: ImportDiagnostic[];
  nonessential: boolean;
  reader: ByteReader;
  registry: Readonly<SpineBinaryRegistry>;
  skins: AttachmentSkin2D[];
  slots: Slot2D[];
  strings: readonly (string | null)[];
}

export type SpineBinarySectionHandler = (context: SpineBinarySectionContext) => void;

export interface SpineBinarySectionHandlerEntry {
  handle: SpineBinarySectionHandler;
  kind: SpineBinarySectionKind;
}

// Mutable state for one animation while its registered timeline handlers run. `unmodeledTimelineCounts`
// keeps the existing feature diagnostics aggregated across the file instead of emitting per keyframe.
export interface SpineBinaryTimelineContext {
  channels: AnimationChannel[];
  drawOrder: Skeleton2DDrawOrderTimeline | null;
  section: SpineBinarySectionContext;
  unregisteredTimelineCounts: Map<SpineBinaryTimelineKind, number>;
  unmodeledTimelineCounts: Map<string, number>;
}

export type SpineBinaryTimelineHandler = (context: SpineBinaryTimelineContext) => void;

export interface SpineBinaryTimelineHandlerEntry {
  handle: SpineBinaryTimelineHandler;
  kind: SpineBinaryTimelineKind;
}

// Caller-owned so two import pipelines can select different handler sets and no registration leaks across
// tests, workers, or assets. Registration is last-write-wins per key, matching the rest of Flight.
export interface SpineBinaryRegistry {
  sectionHandlers: SpineBinarySectionHandlerEntry[];
  timelineHandlers: SpineBinaryTimelineHandlerEntry[];
}
