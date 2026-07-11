import { connectSignal } from '@flighthq/signals';
import type { SocketBackend, SocketCloseInfo, SocketConnection, SocketEventSink, SocketMessage } from '@flighthq/types';

import {
  attachSocket,
  closeSocket,
  createSocket,
  createWebSocketBackend,
  detachSocket,
  disposeSocket,
  enableSocketSignals,
  getSocketBackend,
  getSocketReadyState,
  sendSocketMessage,
  setSocketBackend,
} from './socket';

interface FakeSocket {
  backend: SocketBackend;
  sink: SocketEventSink;
  sent: (string | ArrayBuffer)[];
  closes: { code?: number; reason?: string }[];
  openReturnsNull: boolean;
  sendReturns: boolean;
  lastOptions: { url: string; protocols?: readonly string[]; binaryType?: string } | null;
}

// A mock SocketBackend that records the sink handed to openSocket (so a test can drive
// open/message/close/error) and captures every send/close. openSocket can be made to return a null
// connection to exercise the unsupported-transport path.
function fakeBackend(): FakeSocket {
  const state: FakeSocket = {
    sent: [],
    closes: [],
    openReturnsNull: false,
    sendReturns: true,
    lastOptions: null,
    sink: null as unknown as SocketEventSink,
    backend: null as unknown as SocketBackend,
  };
  state.backend = {
    openSocket(options, events): SocketConnection | null {
      state.sink = events;
      state.lastOptions = { url: options.url, protocols: options.protocols, binaryType: options.binaryType };
      if (state.openReturnsNull) return null;
      return {
        sendSocketFrame(data): boolean {
          state.sent.push(data);
          return state.sendReturns;
        },
        closeSocketConnection(code, reason): void {
          state.closes.push({ code, reason });
        },
      };
    },
  };
  return state;
}

afterEach(() => setSocketBackend(null));

describe('attachSocket', () => {
  it('resumes delivery after a detach', () => {
    const fake = fakeBackend();
    setSocketBackend(fake.backend);
    const socket = createSocket({ url: 'ws://x' });
    const signals = enableSocketSignals(socket);
    let opens = 0;
    connectSignal(signals.onSocketOpen, () => opens++);
    detachSocket(socket);
    attachSocket(socket);
    fake.sink.handleSocketOpen();
    expect(opens).toBe(1);
  });
});

describe('closeSocket', () => {
  it('transitions to closing and forwards code/reason to the connection', () => {
    const fake = fakeBackend();
    setSocketBackend(fake.backend);
    const socket = createSocket({ url: 'ws://x' });
    fake.sink.handleSocketOpen();
    closeSocket(socket, 1000, 'bye');
    expect(getSocketReadyState(socket)).toBe('closing');
    expect(fake.closes).toEqual([{ code: 1000, reason: 'bye' }]);
  });

  it('reaches closed once the backend close event arrives', () => {
    const fake = fakeBackend();
    setSocketBackend(fake.backend);
    const socket = createSocket({ url: 'ws://x' });
    fake.sink.handleSocketOpen();
    closeSocket(socket);
    fake.sink.handleSocketClose({ code: 1000, reason: '', wasClean: true });
    expect(getSocketReadyState(socket)).toBe('closed');
  });

  it('is a no-op when already closed', () => {
    const fake = fakeBackend();
    setSocketBackend(fake.backend);
    const socket = createSocket({ url: 'ws://x' });
    fake.sink.handleSocketOpen();
    closeSocket(socket);
    fake.sink.handleSocketClose({ code: 1000, reason: '', wasClean: true });
    closeSocket(socket);
    expect(fake.closes).toHaveLength(1);
  });
});

describe('createSocket', () => {
  it('opens through the backend in the connecting state and records the url', () => {
    const fake = fakeBackend();
    setSocketBackend(fake.backend);
    const socket = createSocket({ url: 'ws://host/path' });
    expect(socket.url).toBe('ws://host/path');
    expect(getSocketReadyState(socket)).toBe('connecting');
    expect(fake.lastOptions?.url).toBe('ws://host/path');
  });

  it('passes protocols and binaryType through to the backend', () => {
    const fake = fakeBackend();
    setSocketBackend(fake.backend);
    createSocket({ url: 'ws://x', protocols: ['a', 'b'], binaryType: 'arraybuffer' });
    expect(fake.lastOptions?.protocols).toEqual(['a', 'b']);
    expect(fake.lastOptions?.binaryType).toBe('arraybuffer');
  });

  it('tolerates a null connection from an unsupported transport', () => {
    const fake = fakeBackend();
    fake.openReturnsNull = true;
    setSocketBackend(fake.backend);
    const socket = createSocket({ url: 'tcp://x' });
    expect(getSocketReadyState(socket)).toBe('connecting');
    expect(sendSocketMessage(socket, 'x')).toBe(false);
  });

  it('emits a text message with binary false and a binary message with binary true', () => {
    const fake = fakeBackend();
    setSocketBackend(fake.backend);
    const socket = createSocket({ url: 'ws://x' });
    const signals = enableSocketSignals(socket);
    const received: SocketMessage[] = [];
    connectSignal(signals.onSocketMessage, (m) => received.push(m));
    fake.sink.handleSocketOpen();
    fake.sink.handleSocketMessage({ data: 'hi', binary: false });
    const buffer = new Uint8Array([1, 2]).buffer;
    fake.sink.handleSocketMessage({ data: buffer, binary: true });
    expect(received).toEqual([
      { data: 'hi', binary: false },
      { data: buffer, binary: true },
    ]);
  });

  it('emits close info with code, reason, and wasClean', () => {
    const fake = fakeBackend();
    setSocketBackend(fake.backend);
    const socket = createSocket({ url: 'ws://x' });
    const signals = enableSocketSignals(socket);
    const infos: SocketCloseInfo[] = [];
    connectSignal(signals.onSocketClose, (i) => infos.push(i));
    fake.sink.handleSocketClose({ code: 1006, reason: 'gone', wasClean: false });
    expect(infos).toEqual([{ code: 1006, reason: 'gone', wasClean: false }]);
  });

  it('emits onSocketError', () => {
    const fake = fakeBackend();
    setSocketBackend(fake.backend);
    const socket = createSocket({ url: 'ws://x' });
    const signals = enableSocketSignals(socket);
    let errors = 0;
    connectSignal(signals.onSocketError, () => errors++);
    fake.sink.handleSocketError();
    expect(errors).toBe(1);
  });
});

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

describe('detachSocket', () => {
  it('stops backend events from reaching the signals', () => {
    const fake = fakeBackend();
    setSocketBackend(fake.backend);
    const socket = createSocket({ url: 'ws://x' });
    const signals = enableSocketSignals(socket);
    let opens = 0;
    connectSignal(signals.onSocketOpen, () => opens++);
    detachSocket(socket);
    fake.sink.handleSocketOpen();
    expect(opens).toBe(0);
  });
});

describe('disposeSocket', () => {
  it('closes an open connection and detaches so later events fire no signal', () => {
    const fake = fakeBackend();
    setSocketBackend(fake.backend);
    const socket = createSocket({ url: 'ws://x' });
    const signals = enableSocketSignals(socket);
    let messages = 0;
    connectSignal(signals.onSocketMessage, () => messages++);
    fake.sink.handleSocketOpen();
    disposeSocket(socket);
    expect(fake.closes).toHaveLength(1);
    fake.sink.handleSocketMessage({ data: 'x', binary: false });
    expect(messages).toBe(0);
  });

  it('is safe to call on a fresh socket', () => {
    const fake = fakeBackend();
    setSocketBackend(fake.backend);
    const socket = createSocket({ url: 'ws://x' });
    expect(() => disposeSocket(socket)).not.toThrow();
  });
});

describe('enableSocketSignals', () => {
  it('returns the same group on repeated calls', () => {
    const fake = fakeBackend();
    setSocketBackend(fake.backend);
    const socket = createSocket({ url: 'ws://x' });
    expect(enableSocketSignals(socket)).toBe(enableSocketSignals(socket));
  });

  it('leaves a bare socket without signals', () => {
    const fake = fakeBackend();
    setSocketBackend(fake.backend);
    const socket = createSocket({ url: 'ws://x' });
    expect(socket.runtime.signals).toBeNull();
  });
});

describe('getSocketBackend', () => {
  it('lazily returns a web backend by default', () => {
    expect(typeof getSocketBackend().openSocket).toBe('function');
  });

  it('returns the installed backend', () => {
    const fake = fakeBackend();
    setSocketBackend(fake.backend);
    expect(getSocketBackend()).toBe(fake.backend);
  });
});

describe('getSocketReadyState', () => {
  it('reflects connecting → open → closing → closed transitions', () => {
    const fake = fakeBackend();
    setSocketBackend(fake.backend);
    const socket = createSocket({ url: 'ws://x' });
    expect(getSocketReadyState(socket)).toBe('connecting');
    fake.sink.handleSocketOpen();
    expect(getSocketReadyState(socket)).toBe('open');
    closeSocket(socket);
    expect(getSocketReadyState(socket)).toBe('closing');
    fake.sink.handleSocketClose({ code: 1000, reason: '', wasClean: true });
    expect(getSocketReadyState(socket)).toBe('closed');
  });
});

describe('sendSocketMessage', () => {
  it('sends through the connection and returns true when open', () => {
    const fake = fakeBackend();
    setSocketBackend(fake.backend);
    const socket = createSocket({ url: 'ws://x' });
    fake.sink.handleSocketOpen();
    expect(sendSocketMessage(socket, 'ping')).toBe(true);
    expect(fake.sent).toEqual(['ping']);
  });

  it('returns false without throwing when not open', () => {
    const fake = fakeBackend();
    setSocketBackend(fake.backend);
    const socket = createSocket({ url: 'ws://x' });
    expect(sendSocketMessage(socket, 'ping')).toBe(false);
    expect(fake.sent).toEqual([]);
  });

  it('propagates a false send result from the connection', () => {
    const fake = fakeBackend();
    fake.sendReturns = false;
    setSocketBackend(fake.backend);
    const socket = createSocket({ url: 'ws://x' });
    fake.sink.handleSocketOpen();
    expect(sendSocketMessage(socket, 'ping')).toBe(false);
  });
});

describe('setSocketBackend', () => {
  it('restores the lazy web default when passed null', () => {
    const fake = fakeBackend();
    setSocketBackend(fake.backend);
    expect(getSocketBackend()).toBe(fake.backend);
    setSocketBackend(null);
    const web = getSocketBackend();
    expect(web).not.toBe(fake.backend);
    expect(typeof web.openSocket).toBe('function');
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
