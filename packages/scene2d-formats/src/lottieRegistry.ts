import type {
  LottieLayerHandler,
  LottieLayerKind,
  LottieMaskHandler,
  LottieMaskKind,
  LottieRegistry,
  LottieShapeItemHandler,
  LottieShapeItemKind,
  NonEntityCreateResult,
} from '@flighthq/types/contract';

export function createLottieRegistry(): NonEntityCreateResult<LottieRegistry, 'descriptor'> {
  return { layerHandlers: [], maskHandlers: [], shapeItemHandlers: [] };
}

export function getLottieLayerHandler(
  registry: Readonly<LottieRegistry>,
  kind: LottieLayerKind,
): LottieLayerHandler | null {
  return registry.layerHandlers.find((entry) => entry.kind === kind)?.handle ?? null;
}

export function getLottieMaskHandler(
  registry: Readonly<LottieRegistry>,
  kind: LottieMaskKind,
): LottieMaskHandler | null {
  return registry.maskHandlers.find((entry) => entry.kind === kind)?.handle ?? null;
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

export function registerLottieMaskHandler(
  registry: LottieRegistry,
  kind: LottieMaskKind,
  handle: LottieMaskHandler,
): void {
  const index = registry.maskHandlers.findIndex((entry) => entry.kind === kind);
  const entry = { handle, kind };
  if (index === -1) registry.maskHandlers.push(entry);
  else registry.maskHandlers[index] = entry;
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

export function unregisterLottieMaskHandler(registry: LottieRegistry, kind: LottieMaskKind): boolean {
  const index = registry.maskHandlers.findIndex((entry) => entry.kind === kind);
  if (index === -1) return false;
  registry.maskHandlers.splice(index, 1);
  return true;
}

export function unregisterLottieShapeItemHandler(registry: LottieRegistry, kind: LottieShapeItemKind): boolean {
  const index = registry.shapeItemHandlers.findIndex((entry) => entry.kind === kind);
  if (index === -1) return false;
  registry.shapeItemHandlers.splice(index, 1);
  return true;
}
