import type { SocketEventSink } from '@flighthq/types/contract';

import { webSocketBackend as fromPublicLane } from './index';
import { webSocketBackend } from './webSocket';

describe('webSocketBackend', () => {
  // Builder composes `webHostNet` from this value, so it has to be reachable from the package root,
  // not just from the module file. A provider only webHost can see cannot be composed by anyone else.
  // Statically imported, not `await import('./index')`: the barrel pulls in every provider and blows
  // the per-test timeout, which reads as "not exported" when the export is fine.
  it('is exported from the package public lane for host-group composition', () => {
    expect(fromPublicLane).toBe(webSocketBackend);
  });

  it('is a stable provider value rather than an installed singleton', async () => {
    const again = (await import('./webSocket')).webSocketBackend;
    expect(again).toBe(webSocketBackend);
  });

  // Truthfulness of the slot: in a DOM-less environment the provider is still present but reports it
  // cannot open, rather than the Host pretending the transport exists.
  it('opens a connection or reports none, without throwing', () => {
    const sink = {
      handleSocketClose() {},
      handleSocketError() {},
      handleSocketMessage() {},
      handleSocketOpen() {},
    } as SocketEventSink;
    const connection = webSocketBackend.openSocket({ url: 'wss://example.test' }, sink);
    if (connection !== null) connection.closeSocketConnection();
    expect(connection === null || typeof connection.sendSocketFrame === 'function').toBe(true);
  });
});
