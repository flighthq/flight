import type { AnimationChannel } from './AnimationChannel.ts';
import type { Attachment2D } from './Attachment2D.ts';
import type { AttachmentSkin2D } from './AttachmentSkin2D.ts';
import type { Bone2D } from './Bone2D.ts';
import type { ImportDiagnostic } from './ImportDiagnostic.ts';
import type { Skeleton2DImportAnimation } from './Skeleton2DImport.ts';
import type { Slot2D } from './Slot2D.ts';

export const DragonBonesSectionKind = {
  Animations: 'animations',
  Bones: 'bones',
  IkConstraints: 'ikConstraints',
  Skins: 'skins',
  Slots: 'slots',
} as const;

export type DragonBonesSectionKind = string;

export const DragonBonesTimelineKind = {
  Bone: 'bone',
  Deform: 'deform',
  Ik: 'ik',
  Slot: 'slot',
  ZOrder: 'zOrder',
} as const;

export type DragonBonesTimelineKind = string;

export interface DragonBonesSectionContext {
  animations: Skeleton2DImportAnimation[];
  armature: Readonly<Record<string, unknown>>;
  boneIndexByName: Map<string, number>;
  bones: Bone2D[];
  diagnostics?: ImportDiagnostic[];
  displayTable: Map<string, readonly (Attachment2D | null)[]>;
  doc: Readonly<Record<string, unknown>>;
  frameRate: number;
  rawIndexToOutput: number[];
  registry: Readonly<DragonBonesRegistry>;
  skins: AttachmentSkin2D[];
  slotOrder: Map<string, number>;
  slots: Slot2D[];
}

export type DragonBonesSectionHandler = (context: DragonBonesSectionContext) => void;

export interface DragonBonesSectionHandlerEntry {
  handle: DragonBonesSectionHandler;
  kind: DragonBonesSectionKind;
}

export interface DragonBonesTimelineContext {
  channels: AnimationChannel[];
  section: DragonBonesSectionContext;
  unmodeledTimelineCounts: Map<string, number>;
  unresolvedBoneCount: number;
  unregisteredTimelineCounts: Map<DragonBonesTimelineKind, number>;
}

export type DragonBonesTimelineHandler = (
  context: DragonBonesTimelineContext,
  animName: string,
  animEntry: Readonly<Record<string, unknown>>,
) => void;

export interface DragonBonesTimelineHandlerEntry {
  handle: DragonBonesTimelineHandler;
  kind: DragonBonesTimelineKind;
}

export interface DragonBonesRegistry {
  sectionHandlers: DragonBonesSectionHandlerEntry[];
  timelineHandlers: DragonBonesTimelineHandlerEntry[];
}
