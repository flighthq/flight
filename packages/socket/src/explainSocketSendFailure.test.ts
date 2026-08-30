import type { HasNetSocket, SocketBackend, SocketEventSink } from '@flighthq/types/contract';

import { explainSocketSendFailure } from './explainSocketSendFailure';
import { createSocket, disposeSocket, sendSocketMessage } from './socket';

function installBackend(
  hasConnection: boolean,
  sendResult = true,
): { host: HasNetSocket; sink: () => SocketEventSink } {
  let sink!: SocketEventSink;
  const backend: SocketBackend = {
    openSocket(_options, events) {
      sink = events;
      if (!hasConnection) return null;
      return {
        closeSocketConnection() {},
        sendSocketFrame: () => sendResult,
      };
    },
  };
  return { host: hostOf(backend), sink: () => sink };
}

function hostOf(backend: SocketBackend): HasNetSocket {
  return { net: { socket: backend } } as HasNetSocket;
}

describe('explainSocketSendFailure', () => {
  it('identifies an unsupported backend with no connection', () => {
    const { host } = installBackend(false);
    const socket = createSocket(host, { url: 'tcp://host' });
    expect(explainSocketSendFailure(socket)).toEqual({
      reason: 'no-connection',
      readyState: 'connecting',
      url: 'tcp://host',
    });
  });

  it('reports the current non-open phase when a connection exists', () => {
    const { host } = installBackend(true);
    const socket = createSocket(host, { url: 'ws://host' });
    expect(explainSocketSendFailure(socket)).toEqual({
      reason: 'not-open',
      readyState: 'connecting',
      url: 'ws://host',
    });
  });

  it('returns null once the socket can reach its backend, even when that backend returns false', () => {
    const { host, sink: getSink } = installBackend(true, false);
    const socket = createSocket(host, { url: 'ws://host' });
    getSink().handleSocketOpen();
    expect(sendSocketMessage(socket, 'frame')).toBe(false);
    expect(explainSocketSendFailure(socket)).toBeNull();
  });

  it('distinguishes terminal disposal from other closed or disconnected states', () => {
    const { host } = installBackend(true);
    const socket = createSocket(host, { url: 'ws://host' });
    disposeSocket(socket);
    expect(explainSocketSendFailure(socket)).toEqual({
      reason: 'disposed',
      readyState: 'closed',
      url: 'ws://host',
    });
  });
});
