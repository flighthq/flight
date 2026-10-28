// Generated from crates/flight-entity/src/lib.rs by flight-compiler.
// Rust is authoritative; run `npm run generate` after changing it.

export {
  allocateEntity,
  areEntityRuntimeGuardsEnabled,
  attachEntityBinding,
  cloneEntity,
  createGuardedEntity,
  detachEntityBinding,
  disableEntityRuntimeGuards,
  enableEntityRuntimeGuards,
  explainEntityRuntimeWrite,
  finishEntity,
  getEntityBinding,
  getEntityBindingAs,
  getEntityUid,
  hasEntityBinding,
  hasEntityRuntime,
  setEntityRuntimeGuardMode,
  setEntityUid,
  stripEntityRuntime,
} from './contract.ts';

export type { EntityRaw } from './contract.ts';
export { Entity } from './entity.ts';
