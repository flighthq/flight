import type { SocketBackend, SocketEventSink } from '@flighthq/types/contract';

import { explainSocketSendFailure } from './explainSocketSendFailure';
import { createSocket, disposeSocket, sendSocketMessage, setSocketBackend } from './socket';

function installBackend(hasConnection: boolean, sendResult = true): () => SocketEventSink {
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
  setSocketBackend(backend);
  return () => sink;
}

afterEach(() => setSocketBackend(null));

describe('explainSocketSendFailure', () => {
  it('identifies an unsupported backend with no connection', () => {
    installBackend(false);
    const socket = createSocket({ url: 'tcp://host' });
    expect(explainSocketSendFailure(socket)).toEqual({
      reason: 'no-connection',
      readyState: 'connecting',
      url: 'tcp://host',
    });
  });

  it('reports the current non-open phase when a connection exists', () => {
    installBackend(true);
    const socket = createSocket({ url: 'ws://host' });
    expect(explainSocketSendFailure(socket)).toEqual({
      reason: 'not-open',
      readyState: 'connecting',
      url: 'ws://host',
    });
  });

  it('returns null once the socket can reach its backend, even when that backend returns false', () => {
    const getSink = installBackend(true, false);
    const socket = createSocket({ url: 'ws://host' });
    getSink().handleSocketOpen();
    expect(sendSocketMessage(socket, 'frame')).toBe(false);
    expect(explainSocketSendFailure(socket)).toBeNull();
  });

  it('distinguishes terminal disposal from other closed or disconnected states', () => {
    installBackend(true);
    const socket = createSocket({ url: 'ws://host' });
    disposeSocket(socket);
    expect(explainSocketSendFailure(socket)).toEqual({
      reason: 'disposed',
      readyState: 'closed',
      url: 'ws://host',
    });
  });
});
