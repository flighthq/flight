import { allocateEntity, finishEntity } from '@flighthq/entity/contract';
import type {
  EntityConstruction,
  SpineBinaryRegistry,
  SpineBinarySectionHandler,
  SpineBinarySectionKind,
  SpineBinaryTimelineHandler,
  SpineBinaryTimelineKind,
} from '@flighthq/types/contract';

export function createSpineBinaryRegistry(): SpineBinaryRegistry {
  const out = allocateEntity<SpineBinaryRegistry>();
  initializeSpineBinaryRegistry(out);
  return finishEntity(out);
}

export function getSpineBinarySectionHandler(
  registry: Readonly<SpineBinaryRegistry>,
  kind: SpineBinarySectionKind,
): SpineBinarySectionHandler | null {
  return registry.sectionHandlers.find((entry) => entry.kind === kind)?.handle ?? null;
}

export function getSpineBinaryTimelineHandler(
  registry: Readonly<SpineBinaryRegistry>,
  kind: SpineBinaryTimelineKind,
): SpineBinaryTimelineHandler | null {
  return registry.timelineHandlers.find((entry) => entry.kind === kind)?.handle ?? null;
}

export function initializeSpineBinaryRegistry(out: EntityConstruction<SpineBinaryRegistry>): void {
  out.sectionHandlers = [];
  out.timelineHandlers = [];
}

export function registerSpineBinarySectionHandler(
  registry: SpineBinaryRegistry,
  kind: SpineBinarySectionKind,
  handle: SpineBinarySectionHandler,
): void {
  const index = registry.sectionHandlers.findIndex((entry) => entry.kind === kind);
  const entry = { handle, kind };
  if (index === -1) registry.sectionHandlers.push(entry);
  else registry.sectionHandlers[index] = entry;
}

export function registerSpineBinaryTimelineHandler(
  registry: SpineBinaryRegistry,
  kind: SpineBinaryTimelineKind,
  handle: SpineBinaryTimelineHandler,
): void {
  const index = registry.timelineHandlers.findIndex((entry) => entry.kind === kind);
  const entry = { handle, kind };
  if (index === -1) registry.timelineHandlers.push(entry);
  else registry.timelineHandlers[index] = entry;
}

export function unregisterSpineBinarySectionHandler(
  registry: SpineBinaryRegistry,
  kind: SpineBinarySectionKind,
): boolean {
  const index = registry.sectionHandlers.findIndex((entry) => entry.kind === kind);
  if (index === -1) return false;
  registry.sectionHandlers.splice(index, 1);
  return true;
}

export function unregisterSpineBinaryTimelineHandler(
  registry: SpineBinaryRegistry,
  kind: SpineBinaryTimelineKind,
): boolean {
  const index = registry.timelineHandlers.findIndex((entry) => entry.kind === kind);
  if (index === -1) return false;
  registry.timelineHandlers.splice(index, 1);
  return true;
}
