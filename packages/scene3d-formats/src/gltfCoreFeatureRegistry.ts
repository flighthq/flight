import type { GltfCoreFeatureHandler } from './contract.scene3d-formats-types.ts';

// Registers one handler into a caller-owned list. Re-registering the same canonical source kind replaces
// the earlier implementation in place, matching the last-write-wins extension-handler dispatch contract.
// The parser accepts the resulting list as readonly and owns no ambient registry state.
export function registerGltfCoreFeatureHandler(
  handlers: GltfCoreFeatureHandler[],
  handler: GltfCoreFeatureHandler,
): void {
  const index = handlers.findIndex((registered) => registered.kind === handler.kind);
  if (index < 0) handlers.push(handler);
  else handlers[index] = handler;
}
