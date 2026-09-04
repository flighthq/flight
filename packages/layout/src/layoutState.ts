import { allocateEntity, finishEntity } from '@flighthq/entity/contract';
import type { LayoutResolver, LayoutState } from '@flighthq/types/contract';

// Allocates the operation state and its open, last-write-wins resolver registry. Built-in resolvers are
// opt-in registrations, so creating the core state never links anchor, flex, or grid code.
export function createLayoutState(): LayoutState {
  const out = allocateEntity<LayoutState>();
  out.guard = null;
  out.lastFailureActualLength = 0;
  out.lastFailureKind = null;
  out.lastFailureNodeIndex = -1;
  out.lastFailureParentIndex = -1;
  out.lastFailureRequiredLength = 0;
  out.lastFailureResolverKind = null;
  out.resolvers = new Map();
  return finishEntity(out);
}

// Registers or replaces one container-kind resolver. Passing null removes it. Bare built-in names are
// reserved by the SDK; custom kinds use a vendor prefix such as `acme.Flow`.
export function registerLayoutResolver(
  state: Readonly<LayoutState>,
  kind: string,
  resolver: LayoutResolver | null,
): void {
  if (resolver === null) state.resolvers.delete(kind);
  else state.resolvers.set(kind, resolver);
}
