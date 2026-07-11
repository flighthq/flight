import { describe, expect, it } from 'vitest';

import { createAmbientLight } from './ambientLight';
import { createDirectionalLight } from './directionalLight';
import { createPointLight } from './pointLight';
import { createSceneLights } from './sceneLights';

describe('createSceneLights', () => {
  it('fills every absent slot — singles to null, punctual arrays to empty', () => {
    const lights = createSceneLights();
    expect(lights.ambient).toBeNull();
    expect(lights.directional).toBeNull();
    expect(lights.point).toEqual([]);
    expect(lights.spot).toEqual([]);
    expect(lights.hemisphere).toEqual([]);
  });

  it('carries the provided lights and defaults the omitted ones (no undefined slot)', () => {
    const point = createPointLight({ intensity: 2 });
    const lights = createSceneLights({ point: [point] });
    // The omitted directional must be null, not undefined — a literal that dropped it would crash the
    // packer's strict `!== null` check; the constructor makes that unrepresentable.
    expect(lights.directional).toBeNull();
    expect(lights.ambient).toBeNull();
    expect(lights.point).toEqual([point]);
    expect(Object.prototype.hasOwnProperty.call(lights, 'directional')).toBe(true);
  });

  it('passes through ambient + directional when supplied', () => {
    const ambient = createAmbientLight({ intensity: 0.2 });
    const directional = createDirectionalLight({ intensity: 3 });
    const lights = createSceneLights({ ambient, directional });
    expect(lights.ambient).toBe(ambient);
    expect(lights.directional).toBe(directional);
  });
});
