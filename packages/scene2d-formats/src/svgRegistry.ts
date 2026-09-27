import type { NonEntityCreateResult, SvgElementHandler, SvgElementKind, SvgRegistry } from '@flighthq/types/contract';

export function createSvgRegistry(): NonEntityCreateResult<SvgRegistry, 'descriptor'> {
  return { elementHandlers: [] };
}

export function getSvgElementHandler(registry: Readonly<SvgRegistry>, kind: SvgElementKind): SvgElementHandler | null {
  return registry.elementHandlers.find((entry) => entry.kind === kind)?.handle ?? null;
}

export function registerSvgElementHandler(
  registry: SvgRegistry,
  kind: SvgElementKind,
  handle: SvgElementHandler,
): void {
  const index = registry.elementHandlers.findIndex((entry) => entry.kind === kind);
  const entry = { handle, kind };
  if (index === -1) registry.elementHandlers.push(entry);
  else registry.elementHandlers[index] = entry;
}

export function unregisterSvgElementHandler(registry: SvgRegistry, kind: SvgElementKind): boolean {
  const index = registry.elementHandlers.findIndex((entry) => entry.kind === kind);
  if (index === -1) return false;
  registry.elementHandlers.splice(index, 1);
  return true;
}
