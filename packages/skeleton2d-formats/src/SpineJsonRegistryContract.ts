import type { AnimationChannel } from '@flighthq/animation/contract';
import type { ImportDiagnostic } from '@flighthq/importdiagnostics/contract';
import type { AttachmentSkin2D, Bone2D, Skeleton2DDrawOrderTimeline, Slot2D } from '@flighthq/skeleton2d/contract';

import type { Skeleton2DImportAnimation } from './Skeleton2DImport.ts';

export const SpineJsonSectionKind = {
  Animations: 'animations',
  Bones: 'bones',
  Events: 'events',
  IkConstraints: 'ikConstraints',
  PathConstraints: 'pathConstraints',
  Skins: 'skins',
  Slots: 'slots',
  TransformConstraints: 'transformConstraints',
} as const;

export type SpineJsonSectionKind = string;

export const SpineJsonTimelineKind = {
  Bone: 'bone',
  Deform: 'deform',
  DrawOrder: 'drawOrder',
  Event: 'event',
  Ik: 'ik',
  Path: 'path',
  Slot: 'slot',
  Transform: 'transform',
} as const;

export type SpineJsonTimelineKind = string;

export interface SpineJsonSectionContext {
  animations: Skeleton2DImportAnimation[];
  attachmentNames: (string | null)[];
  bones: Bone2D[];
  diagnostics?: ImportDiagnostic[];
  doc: Readonly<Record<string, unknown>>;
  registry: Readonly<SpineJsonRegistry>;
  skins: AttachmentSkin2D[];
  slots: Slot2D[];
}

export type SpineJsonSectionHandler = (context: SpineJsonSectionContext) => void;

export interface SpineJsonSectionHandlerEntry {
  handle: SpineJsonSectionHandler;
  kind: SpineJsonSectionKind;
}

export interface SpineJsonTimelineContext {
  channels: AnimationChannel[];
  drawOrder: Skeleton2DDrawOrderTimeline | null;
  section: SpineJsonSectionContext;
  unregisteredTimelineCounts: Map<SpineJsonTimelineKind, number>;
  unmodeledTimelineCounts: Map<string, number>;
}

export type SpineJsonTimelineHandler = (
  context: SpineJsonTimelineContext,
  animName: string,
  animEntry: Readonly<Record<string, unknown>>,
) => void;

export interface SpineJsonTimelineHandlerEntry {
  handle: SpineJsonTimelineHandler;
  kind: SpineJsonTimelineKind;
}

export interface SpineJsonRegistry {
  sectionHandlers: SpineJsonSectionHandlerEntry[];
  timelineHandlers: SpineJsonTimelineHandlerEntry[];
}
