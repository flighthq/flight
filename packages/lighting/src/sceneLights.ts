import { allocateEntity, finishEntity } from '@flighthq/entity/contract';
import type { Scene3DLights, Scene3DLightsLike, EntityConstruction } from '@flighthq/types/contract';

export function createScene3DLights(options?: Readonly<Partial<Scene3DLightsLike>>): Scene3DLights {
  const out = allocateEntity<Scene3DLights>();
  initializeScene3DLights(out, options);
  return finishEntity(out);
}

// Constructs a `Scene3DLights` draw-argument, filling every absent slot: the single ambient/directional
// terms default to `null` and the punctual arrays to empty. Prefer this over a bare object literal —
// a literal that omits a slot passes `undefined` where the packer expects a light-or-null, which the
// strict `!== null` presence check reads as "present" and then dereferences (the classic
// `undefined.direction` crash). Going through the constructor makes an omitted slot unrepresentable.
//
// `Scene3DLights` is a per-draw argument (lights are not scene members), but the exported `create*`
// product still carries Flight's Entity shape invariant. That identity does not imply a GPU binding:
// the packed `Scene3DLightBlock` is what a backend caches, keyed off the render state.
export function initializeScene3DLights(
  out: EntityConstruction<Scene3DLights>,
  options?: Readonly<Partial<Scene3DLightsLike>>,
): void {
  out.ambient = options?.ambient ?? null;
  out.directional = options?.directional ?? null;
  out.hemisphere = options?.hemisphere ?? [];
  out.point = options?.point ?? [];
  out.spot = options?.spot ?? [];
}
