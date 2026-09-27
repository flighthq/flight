import type {
  LottieLayerHandler,
  LottieLayerKind,
  LottieRegistry,
  LottieShapeItemHandler,
  LottieShapeItemKind,
  NonEntityCreateResult,
} from '@flighthq/types/contract';

export function createLottieRegistry(): NonEntityCreateResult<LottieRegistry, 'descriptor'> {
  return { layerHandlers: [], shapeItemHandlers: [] };
}

export function getLottieLayerHandler(
  registry: Readonly<LottieRegistry>,
  kind: LottieLayerKind,
): LottieLayerHandler | null {
  return registry.layerHandlers.find((entry) => entry.kind === kind)?.handle ?? null;
}

export function getLottieShapeItemHandler(
  registry: Readonly<LottieRegistry>,
  kind: LottieShapeItemKind,
): LottieShapeItemHandler | null {
  return registry.shapeItemHandlers.find((entry) => entry.kind === kind)?.handle ?? null;
}

export function registerLottieLayerHandler(
  registry: LottieRegistry,
  kind: LottieLayerKind,
  handle: LottieLayerHandler,
): void {
  const index = registry.layerHandlers.findIndex((entry) => entry.kind === kind);
  const entry = { handle, kind };
  if (index === -1) registry.layerHandlers.push(entry);
  else registry.layerHandlers[index] = entry;
}

export function registerLottieShapeItemHandler(
  registry: LottieRegistry,
  kind: LottieShapeItemKind,
  handle: LottieShapeItemHandler,
): void {
  const index = registry.shapeItemHandlers.findIndex((entry) => entry.kind === kind);
  const entry = { handle, kind };
  if (index === -1) registry.shapeItemHandlers.push(entry);
  else registry.shapeItemHandlers[index] = entry;
}

export function unregisterLottieLayerHandler(registry: LottieRegistry, kind: LottieLayerKind): boolean {
  const index = registry.layerHandlers.findIndex((entry) => entry.kind === kind);
  if (index === -1) return false;
  registry.layerHandlers.splice(index, 1);
  return true;
}

export function unregisterLottieShapeItemHandler(registry: LottieRegistry, kind: LottieShapeItemKind): boolean {
  const index = registry.shapeItemHandlers.findIndex((entry) => entry.kind === kind);
  if (index === -1) return false;
  registry.shapeItemHandlers.splice(index, 1);
  return true;
}
