import type { SceneLights } from '@flighthq/types';

// Constructs a `SceneLights` draw-argument, filling every absent slot: the single ambient/directional
// terms default to `null` and the punctual arrays to empty. Prefer this over a bare object literal —
// a literal that omits a slot passes `undefined` where the packer expects a light-or-null, which the
// strict `!== null` presence check reads as "present" and then dereferences (the classic
// `undefined.direction` crash). Going through the constructor makes an omitted slot unrepresentable.
//
// `SceneLights` is a per-draw argument (lights are not scene members), so it is NOT an Entity: it
// carries no GPU binding identity of its own — the packed `SceneLightBlock` is what a backend caches,
// keyed off the render state. The individual lights it references (`createPointLight`, …) are the
// entities. This is the constructor for the plain-data collection, not an entity factory.
export function createSceneLights(options?: Readonly<Partial<SceneLights>>): SceneLights {
  return {
    ambient: options?.ambient ?? null,
    directional: options?.directional ?? null,
    hemisphere: options?.hemisphere ?? [],
    point: options?.point ?? [],
    spot: options?.spot ?? [],
  };
}
