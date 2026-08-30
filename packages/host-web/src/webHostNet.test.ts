import { EntityRuntimeKey } from '@flighthq/types/contract';
import type { HasNetHttp, HasNetSocket, Host } from '@flighthq/types/contract';

import { webHostNet } from './webHostNet';

describe('webHostNet', () => {
  it('is an Entity (carries EntityRuntimeKey)', () => {
    expect(EntityRuntimeKey in webHostNet).toBe(true);
  });

  it('is a Host (carries every canonical group, not just net)', () => {
    const host: Host = webHostNet;
    expect(host.net).toBeDefined();
    expect(host.app).toBeDefined();
    expect(host.system).toBeDefined();
  });

  it('satisfies HasNetHttp with a truthful http backend', () => {
    const host: HasNetHttp = webHostNet;
    expect(host.net.http).toBeDefined();
    expect(typeof host.net.http.sendNetRequest).toBe('function');
  });

  it('satisfies HasNetSocket with a truthful socket backend', () => {
    const host: HasNetSocket = webHostNet;
    expect(host.net.socket).toBeDefined();
    expect(typeof host.net.socket.openSocket).toBe('function');
  });

  it('composes exactly http and socket on the net group', () => {
    expect(Object.keys(webHostNet.net).sort()).toEqual(['http', 'socket']);
  });

  it('exposes only the single export (import isolation)', async () => {
    const source = await import('./webHostNet');
    expect(Object.keys(source)).toEqual(['webHostNet']);
  });
});
