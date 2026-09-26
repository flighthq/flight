import type {
  NonEntityCreateResult,
  SpineJsonRegistry,
  SpineJsonSectionHandler,
  SpineJsonSectionKind,
  SpineJsonTimelineHandler,
  SpineJsonTimelineKind,
} from '@flighthq/types/contract';

export function createSpineJsonRegistry(): NonEntityCreateResult<SpineJsonRegistry, 'descriptor'> {
  return { sectionHandlers: [], timelineHandlers: [] };
}

export function getSpineJsonSectionHandler(
  registry: Readonly<SpineJsonRegistry>,
  kind: SpineJsonSectionKind,
): SpineJsonSectionHandler | null {
  return registry.sectionHandlers.find((entry) => entry.kind === kind)?.handle ?? null;
}

export function getSpineJsonTimelineHandler(
  registry: Readonly<SpineJsonRegistry>,
  kind: SpineJsonTimelineKind,
): SpineJsonTimelineHandler | null {
  return registry.timelineHandlers.find((entry) => entry.kind === kind)?.handle ?? null;
}

export function registerSpineJsonSectionHandler(
  registry: SpineJsonRegistry,
  kind: SpineJsonSectionKind,
  handle: SpineJsonSectionHandler,
): void {
  const index = registry.sectionHandlers.findIndex((entry) => entry.kind === kind);
  const entry = { handle, kind };
  if (index === -1) registry.sectionHandlers.push(entry);
  else registry.sectionHandlers[index] = entry;
}

export function registerSpineJsonTimelineHandler(
  registry: SpineJsonRegistry,
  kind: SpineJsonTimelineKind,
  handle: SpineJsonTimelineHandler,
): void {
  const index = registry.timelineHandlers.findIndex((entry) => entry.kind === kind);
  const entry = { handle, kind };
  if (index === -1) registry.timelineHandlers.push(entry);
  else registry.timelineHandlers[index] = entry;
}

export function unregisterSpineJsonSectionHandler(registry: SpineJsonRegistry, kind: SpineJsonSectionKind): boolean {
  const index = registry.sectionHandlers.findIndex((entry) => entry.kind === kind);
  if (index === -1) return false;
  registry.sectionHandlers.splice(index, 1);
  return true;
}

export function unregisterSpineJsonTimelineHandler(registry: SpineJsonRegistry, kind: SpineJsonTimelineKind): boolean {
  const index = registry.timelineHandlers.findIndex((entry) => entry.kind === kind);
  if (index === -1) return false;
  registry.timelineHandlers.splice(index, 1);
  return true;
}
