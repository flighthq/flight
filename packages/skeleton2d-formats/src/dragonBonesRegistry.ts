import type {
  DragonBonesRegistry,
  DragonBonesSectionHandler,
  DragonBonesSectionKind,
  DragonBonesTimelineHandler,
  DragonBonesTimelineKind,
  NonEntityCreateResult,
} from '@flighthq/types/contract';

export function createDragonBonesRegistry(): NonEntityCreateResult<DragonBonesRegistry, 'descriptor'> {
  return { sectionHandlers: [], timelineHandlers: [] };
}

export function getDragonBonesSectionHandler(
  registry: Readonly<DragonBonesRegistry>,
  kind: DragonBonesSectionKind,
): DragonBonesSectionHandler | null {
  return registry.sectionHandlers.find((entry) => entry.kind === kind)?.handle ?? null;
}

export function getDragonBonesTimelineHandler(
  registry: Readonly<DragonBonesRegistry>,
  kind: DragonBonesTimelineKind,
): DragonBonesTimelineHandler | null {
  return registry.timelineHandlers.find((entry) => entry.kind === kind)?.handle ?? null;
}

export function registerDragonBonesSectionHandler(
  registry: DragonBonesRegistry,
  kind: DragonBonesSectionKind,
  handle: DragonBonesSectionHandler,
): void {
  const index = registry.sectionHandlers.findIndex((entry) => entry.kind === kind);
  const entry = { handle, kind };
  if (index === -1) registry.sectionHandlers.push(entry);
  else registry.sectionHandlers[index] = entry;
}

export function registerDragonBonesTimelineHandler(
  registry: DragonBonesRegistry,
  kind: DragonBonesTimelineKind,
  handle: DragonBonesTimelineHandler,
): void {
  const index = registry.timelineHandlers.findIndex((entry) => entry.kind === kind);
  const entry = { handle, kind };
  if (index === -1) registry.timelineHandlers.push(entry);
  else registry.timelineHandlers[index] = entry;
}

export function unregisterDragonBonesSectionHandler(
  registry: DragonBonesRegistry,
  kind: DragonBonesSectionKind,
): boolean {
  const index = registry.sectionHandlers.findIndex((entry) => entry.kind === kind);
  if (index === -1) return false;
  registry.sectionHandlers.splice(index, 1);
  return true;
}

export function unregisterDragonBonesTimelineHandler(
  registry: DragonBonesRegistry,
  kind: DragonBonesTimelineKind,
): boolean {
  const index = registry.timelineHandlers.findIndex((entry) => entry.kind === kind);
  if (index === -1) return false;
  registry.timelineHandlers.splice(index, 1);
  return true;
}
