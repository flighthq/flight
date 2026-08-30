import { EntityRuntimeKey } from '@flighthq/types/contract';
import type { HasNetHttp } from '@flighthq/types/contract';

import { webHostNet } from './webHostNet';

describe('webHostNet', () => {
  it('is an Entity (carries EntityRuntimeKey)', () => {
    expect(EntityRuntimeKey in webHostNet).toBe(true);
  });

  it('satisfies HasNetHttp with a truthful http backend', () => {
    const host: HasNetHttp = webHostNet;
    expect(host.net.http).toBeDefined();
    expect(typeof host.net.http.sendNetRequest).toBe('function');
  });

  it('exposes only net-group backends (import isolation)', async () => {
    const source = await import('./webHostNet');
    const keys = Object.keys(source);
    expect(keys).toEqual(['webHostNet']);
  });

  it('composes only the net group on the entity', () => {
    expect(Object.keys(webHostNet)).toEqual(['net']);
  });
});
