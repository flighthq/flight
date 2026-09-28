import { reportImportDiagnostic } from '@flighthq/importdiagnostics/contract';
import { createSkeleton2D } from '@flighthq/skeleton2d/contract';
import type { DragonBonesRegistry, DragonBonesSectionContext, ImportDiagnostic } from '@flighthq/types/contract';
import { ImportDiagnosticSeverity } from '@flighthq/types/contract';
import type { Skeleton2DImport } from '@flighthq/types/contract';

import { createDragonBonesRegistry } from './dragonBonesRegistry.ts';
import { registerDragonBonesSectionHandlers } from './dragonBonesSectionHandlers.ts';
import { registerDragonBonesTimelineHandlers } from './dragonBonesTimelineHandlers.ts';

export function parseDragonBonesSkeleton(json: string, diagnostics?: ImportDiagnostic[]): Skeleton2DImport | null {
  const registry = createDragonBonesRegistry();
  registerDragonBonesSectionHandlers(registry);
  registerDragonBonesTimelineHandlers(registry);
  return parseDragonBonesSkeletonWithRegistry(json, registry, diagnostics);
}

export function parseDragonBonesSkeletonWithRegistry(
  json: string,
  registry: Readonly<DragonBonesRegistry>,
  diagnostics?: ImportDiagnostic[],
): Skeleton2DImport | null {
  let doc: unknown;
  try {
    doc = JSON.parse(json);
  } catch {
    return null;
  }
  if (doc === null || typeof doc !== 'object') return null;
  const armatures = (doc as Record<string, unknown>).armature;
  if (!Array.isArray(armatures) || armatures.length === 0) return null;
  if (!checkDragonBonesVersion(doc as Record<string, unknown>, diagnostics)) return null;
  if (armatures.length > 1) {
    reportImportDiagnostic(
      diagnostics,
      ImportDiagnosticSeverity.Skip,
      'dragonbones.multi-armature-unsupported',
      'parseDragonBonesSkeleton',
      { armatures: armatures.length - 1 },
    );
  }
  const first = armatures[0];
  if (first === null || typeof first !== 'object') return null;
  const armature = first as Record<string, unknown>;
  const context: DragonBonesSectionContext = {
    animations: [],
    armature,
    boneIndexByName: new Map(),
    bones: [],
    diagnostics,
    displayTable: new Map(),
    doc: doc as Record<string, unknown>,
    frameRate: dragonBonesFrameRate(armature, doc as Record<string, unknown>),
    rawIndexToOutput: [],
    registry,
    skins: [],
    slotOrder: buildDragonBonesSlotOrder(armature.slot),
    slots: [],
  };
  for (const entry of registry.sectionHandlers) {
    entry.handle(context);
  }
  const skeleton = createSkeleton2D(context.bones, context.slots);
  if (context.skins.length > 0) skeleton.skins = context.skins;
  return { animations: context.animations, skeleton };
}

function checkDragonBonesVersion(doc: Readonly<Record<string, unknown>>, diagnostics?: ImportDiagnostic[]): boolean {
  const compatible = typeof doc.compatibleVersion === 'string' ? doc.compatibleVersion : null;
  const declared = typeof doc.version === 'string' ? doc.version : null;
  const resolved = compatible ?? declared;
  if (resolved === null) {
    reportImportDiagnostic(
      diagnostics,
      ImportDiagnosticSeverity.Reject,
      'dragonbones.version-missing',
      'parseDragonBonesSkeleton',
      {},
    );
    return false;
  }
  if (resolved !== DRAGONBONES_COMPATIBLE_VERSION) {
    reportImportDiagnostic(
      diagnostics,
      ImportDiagnosticSeverity.Reject,
      'dragonbones.version-unsupported',
      'parseDragonBonesSkeleton',
      { version: resolved },
    );
    return false;
  }
  return true;
}

function buildDragonBonesSlotOrder(raw: unknown): Map<string, number> {
  const order = new Map<string, number>();
  if (!Array.isArray(raw)) return order;
  let index = 0;
  for (const entry of raw) {
    if (entry === null || typeof entry !== 'object') continue;
    const name = (entry as Record<string, unknown>).name;
    if (typeof name === 'string') order.set(name, index);
    index++;
  }
  return order;
}

function dragonBonesFrameRate(
  armature: Readonly<Record<string, unknown>>,
  doc: Readonly<Record<string, unknown>>,
): number {
  const armatureRate = numberOr(armature.frameRate, 0);
  if (Number.isFinite(armatureRate) && armatureRate > 0) return armatureRate;
  const documentRate = numberOr(doc.frameRate, 0);
  if (Number.isFinite(documentRate) && documentRate > 0) return documentRate;
  return DEFAULT_DRAGONBONES_FRAME_RATE;
}

function numberOr(value: unknown, fallback: number): number {
  return typeof value === 'number' ? value : fallback;
}

const DRAGONBONES_COMPATIBLE_VERSION = '5.5';
const DEFAULT_DRAGONBONES_FRAME_RATE = 24;
