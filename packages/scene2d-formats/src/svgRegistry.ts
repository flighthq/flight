import type {
  NonEntityCreateResult,
  SvgClipHandler,
  SvgClipKind,
  SvgElementHandler,
  SvgElementKind,
  SvgRegistry,
} from '@flighthq/types/contract';

export function createSvgRegistry(): NonEntityCreateResult<SvgRegistry, 'descriptor'> {
  return { clipHandlers: [], elementHandlers: [] };
}

export function getSvgClipHandler(registry: Readonly<SvgRegistry>, kind: SvgClipKind): SvgClipHandler | null {
  return registry.clipHandlers.find((entry) => entry.kind === kind)?.handle ?? null;
}

export function getSvgElementHandler(registry: Readonly<SvgRegistry>, kind: SvgElementKind): SvgElementHandler | null {
  return registry.elementHandlers.find((entry) => entry.kind === kind)?.handle ?? null;
}

export function registerSvgClipHandler(registry: SvgRegistry, kind: SvgClipKind, handle: SvgClipHandler): void {
  const index = registry.clipHandlers.findIndex((entry) => entry.kind === kind);
  const entry = { handle, kind };
  if (index === -1) registry.clipHandlers.push(entry);
  else registry.clipHandlers[index] = entry;
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

export function unregisterSvgClipHandler(registry: SvgRegistry, kind: SvgClipKind): boolean {
  const index = registry.clipHandlers.findIndex((entry) => entry.kind === kind);
  if (index === -1) return false;
  registry.clipHandlers.splice(index, 1);
  return true;
}

export function unregisterSvgElementHandler(registry: SvgRegistry, kind: SvgElementKind): boolean {
  const index = registry.elementHandlers.findIndex((entry) => entry.kind === kind);
  if (index === -1) return false;
  registry.elementHandlers.splice(index, 1);
  return true;
}
