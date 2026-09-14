import type { GltfExtensionHandler } from '@flighthq/types/contract';

// Registers one extension handler into a caller-owned list. Canonical extension kinds are unique and
// re-registration replaces the earlier implementation in place, matching parser dispatch semantics.
export function registerGltfExtensionHandler(handlers: GltfExtensionHandler[], handler: GltfExtensionHandler): void {
  const index = handlers.findIndex((registered) => registered.kind === handler.kind);
  if (index < 0) handlers.push(handler);
  else handlers[index] = handler;
}
