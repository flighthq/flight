import type { SocketCloseInfo, SocketEventSink, SocketMessage } from '@flighthq/types/contract';

import { webHostSocket as fromPublicLane } from './index';
import { createWebSocketBackend, initializeWebSocketBackend, webHostSocket } from './webSocket';

describe('createWebSocketBackend', () => {
  it('constructs a WebSocket with url and protocols and sets binaryType', () => {
    const restore = installFakeWebSocket();
    try {
      createWebSocketBackend().openSocket(
        { url: 'ws://host', protocols: ['chat'], binaryType: 'arraybuffer' },
        noopSink(),
      );
      const ws = FakeWebSocket.last!;
      expect(ws.url).toBe('ws://host');
      expect(ws.protocols).toEqual(['chat']);
      expect(ws.binaryType).toBe('arraybuffer');
    } finally {
      restore();
    }
  });

  it('translates an incoming string message to binary false', () => {
    const restore = installFakeWebSocket();
    try {
      const received: SocketMessage[] = [];
      createWebSocketBackend().openSocket({ url: 'ws://x' }, sinkCollecting(received));
      FakeWebSocket.last!.onmessage!({ data: 'hello' } as MessageEvent);
      expect(received).toEqual([{ data: 'hello', binary: false }]);
    } finally {
      restore();
    }
  });

  it('translates an incoming ArrayBuffer message to binary true', () => {
    const restore = installFakeWebSocket();
    try {
      const received: SocketMessage[] = [];
      createWebSocketBackend().openSocket({ url: 'ws://x' }, sinkCollecting(received));
      const buffer = new Uint8Array([9]).buffer;
      FakeWebSocket.last!.onmessage!({ data: buffer } as MessageEvent);
      expect(received[0]).toEqual({ data: buffer, binary: true });
    } finally {
      restore();
    }
  });

  it('maps close events and open into the sink', () => {
    const restore = installFakeWebSocket();
    try {
      let opened = false;
      const closes: SocketCloseInfo[] = [];
      const sink: SocketEventSink = {
        ...noopSink(),
        handleSocketOpen: () => (opened = true),
        handleSocketClose: (i) => closes.push(i),
      };
      createWebSocketBackend().openSocket({ url: 'ws://x' }, sink);
      const ws = FakeWebSocket.last!;
      ws.onopen!(new Event('open'));
      ws.onclose!({ code: 1000, reason: 'done', wasClean: true } as CloseEvent);
      expect(opened).toBe(true);
      expect(closes).toEqual([{ code: 1000, reason: 'done', wasClean: true }]);
    } finally {
      restore();
    }
  });

  it('sends only when the WebSocket is OPEN and closes with code/reason', () => {
    const restore = installFakeWebSocket();
    try {
      const connection = createWebSocketBackend().openSocket({ url: 'ws://x' }, noopSink())!;
      const ws = FakeWebSocket.last!;
      ws.readyState = FakeWebSocket.CONNECTING;
      expect(connection.sendSocketFrame('x')).toBe(false);
      ws.readyState = FakeWebSocket.OPEN;
      expect(connection.sendSocketFrame('y')).toBe(true);
      expect(ws.sent).toEqual(['y']);
      connection.closeSocketConnection(1001, 'later');
      expect(ws.closed).toEqual({ code: 1001, reason: 'later' });
    } finally {
      restore();
    }
  });

  it('returns a null connection when WebSocket is unavailable', () => {
    const original = (globalThis as { WebSocket?: unknown }).WebSocket;
    (globalThis as { WebSocket?: unknown }).WebSocket = undefined;
    try {
      expect(createWebSocketBackend().openSocket({ url: 'ws://x' }, noopSink())).toBeNull();
    } finally {
      (globalThis as { WebSocket?: unknown }).WebSocket = original;
    }
  });
});

describe('initializeWebSocketBackend', () => {
  it('is the construction initializer of createWebSocketBackend', () => {
    expect(typeof initializeWebSocketBackend).toBe('function');
  });
});

describe('webHostSocket', () => {
  // Builder composes `webHostNet` from this value, so it has to be reachable from the package root,
  // not just from the module file. A provider only webHost can see cannot be composed by anyone else.
  // Statically imported, not `await import('./index')`: the barrel pulls in every provider and blows
  // the per-test timeout, which reads as "not exported" when the export is fine.
  it('is exported from the package public lane for host-group composition', () => {
    expect(fromPublicLane).toBe(webHostSocket);
  });

  it('is a stable provider value rather than an installed singleton', async () => {
    const again = (await import('./webSocket')).webHostSocket;
    expect(again).toBe(webHostSocket);
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
    const connection = webHostSocket.openSocket({ url: 'wss://example.test' }, sink);
    if (connection !== null) connection.closeSocketConnection();
    expect(connection === null || typeof connection.sendSocketFrame === 'function').toBe(true);
  });
});

function noopSink(): SocketEventSink {
  return {
    handleSocketOpen() {},
    handleSocketMessage() {},
    handleSocketClose() {},
    handleSocketError() {},
  };
}

function sinkCollecting(received: SocketMessage[]): SocketEventSink {
  return { ...noopSink(), handleSocketMessage: (m) => received.push(m) };
}

// A minimal stand-in for the DOM WebSocket, recording constructor args, sends, and close, and
// exposing dispatchable onopen/onmessage/onclose/onerror handlers.
class FakeWebSocket {
  static CONNECTING = 0;
  static OPEN = 1;
  static CLOSING = 2;
  static CLOSED = 3;
  static last: FakeWebSocket | null = null;

  url: string;
  protocols?: readonly string[];
  binaryType = 'blob';
  readyState = FakeWebSocket.CONNECTING;
  sent: (string | ArrayBuffer)[] = [];
  closed: { code?: number; reason?: string } | null = null;
  onopen: ((event: Event) => void) | null = null;
  onmessage: ((event: MessageEvent) => void) | null = null;
  onclose: ((event: CloseEvent) => void) | null = null;
  onerror: ((event: Event) => void) | null = null;

  constructor(url: string, protocols?: string | string[]) {
    this.url = url;
    if (protocols !== undefined) this.protocols = typeof protocols === 'string' ? [protocols] : protocols;
    FakeWebSocket.last = this;
  }

  send(data: string | ArrayBuffer): void {
    this.sent.push(data);
  }

  close(code?: number, reason?: string): void {
    this.closed = { code, reason };
  }
}

function installFakeWebSocket(): () => void {
  const original = (globalThis as { WebSocket?: unknown }).WebSocket;
  FakeWebSocket.last = null;
  (globalThis as { WebSocket?: unknown }).WebSocket = FakeWebSocket;
  return () => {
    (globalThis as { WebSocket?: unknown }).WebSocket = original;
  };
}
