import { addLogSink, createMemoryLogSink, getMemoryLogSinkEntries, removeLogSink } from '@flighthq/log/contract';
import type { HasNetSocket, LogEntry, SocketBackend } from '@flighthq/types/contract';

import { areSocketGuardsEnabled, disableSocketGuards, enableSocketGuards } from './enableSocketGuards';
import { closeSocket, createSocket, disposeSocket, enableSocketSignals, sendSocketMessage } from './socket';

function captureLog(run: () => void): readonly LogEntry[] {
  const sink = createMemoryLogSink(8);
  addLogSink(sink.sink);
  try {
    run();
    return getMemoryLogSinkEntries(sink);
  } finally {
    removeLogSink(sink.sink);
  }
}

function backend(hasConnection: boolean): SocketBackend {
  return {
    openSocket() {
      if (!hasConnection) return null;
      return { closeSocketConnection() {}, sendSocketFrame: () => true };
    },
  };
}

afterEach(() => {
  disableSocketGuards();
});

function hostOf(backend: SocketBackend): HasNetSocket {
  return { net: { socket: backend } } as HasNetSocket;
}

describe('areSocketGuardsEnabled', () => {
  it('reports whether the global guard hook is installed', () => {
    enableSocketGuards();
    expect(areSocketGuardsEnabled()).toBe(true);
    disableSocketGuards();
    expect(areSocketGuardsEnabled()).toBe(false);
  });
});

describe('disableSocketGuards', () => {
  it('restores silent core behavior', () => {
    enableSocketGuards();
    disableSocketGuards();
    const host = hostOf(backend(false));
    expect(captureLog(() => createSocket(host, { url: 'tcp://silent' }))).toEqual([]);
  });
});

describe('enableSocketGuards', () => {
  it('warns once when socket creation produces no connection', () => {
    enableSocketGuards();
    const host = hostOf(backend(false));
    const entries = captureLog(() => {
      createSocket(host, { url: 'tcp://unsupported' });
      createSocket(host, { url: 'tcp://unsupported-again' });
    });
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({ channel: 'socket' });
    expect(entries[0].data).toMatchObject({
      operation: 'createSocket',
      reason: 'no-connection',
      url: 'tcp://unsupported',
    });
    expect(String((entries[0].data as Record<string, unknown>).message)).toContain('net.socket');
  });

  it('warns once per command issued after terminal disposal', () => {
    enableSocketGuards();
    const host = hostOf(backend(true));
    const socket = createSocket(host, { url: 'ws://disposed' });
    disposeSocket(socket);
    const entries = captureLog(() => {
      closeSocket(socket);
      closeSocket(socket);
      sendSocketMessage(socket, 'frame');
      enableSocketSignals(socket);
    });
    expect(entries).toHaveLength(3);
    expect(entries.map((entry) => (entry.data as Record<string, unknown>).operation)).toEqual([
      'closeSocket',
      'sendSocketMessage',
      'enableSocketSignals',
    ]);
    for (const entry of entries) {
      expect(entry.data).toMatchObject({ reason: 'disposed', url: 'ws://disposed' });
      expect(String((entry.data as Record<string, unknown>).message)).toContain('createSocket');
    }
  });

  it('stays silent for ordinary pre-open sends and closes', () => {
    enableSocketGuards();
    const host = hostOf(backend(true));
    const socket = createSocket(host, { url: 'ws://connecting' });
    const entries = captureLog(() => {
      sendSocketMessage(socket, 'early');
      closeSocket(socket);
    });
    expect(entries).toEqual([]);
  });
});
