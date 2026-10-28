// Generated from crates/flight-entity/src/lib.rs by flight-compiler.
// Rust is authoritative; run `npm run generate` after changing it.

export {
  attachEntityBinding,
  attachEntityWrapper,
  detachEntityBinding,
  getEntityBinding,
  getEntityBindingAs,
  getEntityWrapperAs,
  hasEntityBinding,
} from './binding.ts';
export { cloneEntity, stripEntityRuntime } from './clone.ts';
export { disableEntityRuntimeGuards, enableEntityRuntimeGuards } from './enableEntityRuntimeGuards.ts';
export { allocateEntity, finishEntity } from './entity.ts';
export { getEntityUid, setEntityUid } from './entityUid.ts';
export { explainEntityRuntimeWrite } from './explainEntityRuntimeWrite.ts';
export {
  areEntityRuntimeGuardsEnabled,
  createGuardedEntity,
  createGuardedEntityRuntime,
  reportEntityRuntimeWrite,
  setEntityRuntimeGuardMode,
  setEntityRuntimeWriteGuard,
} from './guards.ts';
export { createEntityRuntime, getEntityRuntime, hasEntityRuntime } from './runtime.ts';
export { EntityRuntimeKey, EntityRuntimeWriteSlot } from './types.ts';
export type {
  Entity,
  EntityConstruction,
  EntityRaw,
  EntityRuntime,
  EntityRuntimeWriteExplanation,
  EntityRuntimeWriteGuard,
  EntityWithoutRuntime,
  Kind,
} from './types.ts';
