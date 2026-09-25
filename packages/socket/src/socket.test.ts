import { connectSignal } from '@flighthq/signals/contract';
import type {
  HostSocketCapability,
  SocketCloseInfo,
  SocketConnection,
  SocketEventSink,
  SocketMessage,
  TcpSocketConnection,
  TcpSocketOptions,
} from '@flighthq/types/contract';

import { openTcpSocket } from './index.ts';
import {
  attachSocket,
  closeSocket,
  createSocket,
  detachSocket,
  disposeSocket,
  enableSocketSignals,
  getSocketReadyState,
  sendSocketMessage,
  setSocketGuard,
} from './socket.ts';

interface FakeSocket {
  backend: HostSocketCapability;
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
    backend: null as unknown as HostSocketCapability,
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

afterEach(() => {
  setSocketGuard(null);
});

function hostOf(backend: HostSocketCapability): { readonly net: { readonly socket: HostSocketCapability } } {
  return { net: { socket: backend } } as { readonly net: { readonly socket: HostSocketCapability } };
}

function tcpConnection(): TcpSocketConnection {
  return {
    readable: new ReadableStream<Uint8Array>(),
    writable: new WritableStream<Uint8Array>(),
    closeTcpSocketConnection(): void {},
  };
}

describe('attachSocket', () => {
  it('resumes delivery after a detach', () => {
    const fake = fakeBackend();
    const host = hostOf(fake.backend);
    const socket = createSocket(host.net.socket, { url: 'ws://x' });
    const signals = enableSocketSignals(socket);
    let opens = 0;
    connectSignal(signals.onSocketOpen, () => opens++);
    detachSocket(socket);
    attachSocket(socket);
    fake.sink.handleSocketOpen();
    expect(opens).toBe(1);
  });

  it('cannot resume delivery after terminal disposal', () => {
    const fake = fakeBackend();
    const host = hostOf(fake.backend);
    const socket = createSocket(host.net.socket, { url: 'ws://x' });
    const signals = enableSocketSignals(socket);
    let opens = 0;
    connectSignal(signals.onSocketOpen, () => opens++);
    disposeSocket(socket);
    attachSocket(socket);
    fake.sink.handleSocketOpen();
    expect(opens).toBe(0);
    expect(socket.runtime.delivering).toBe(false);
  });
});

describe('closeSocket', () => {
  it('transitions to closing and forwards code/reason to the connection', () => {
    const fake = fakeBackend();
    const host = hostOf(fake.backend);
    const socket = createSocket(host.net.socket, { url: 'ws://x' });
    fake.sink.handleSocketOpen();
    closeSocket(socket, 1000, 'bye');
    expect(getSocketReadyState(socket)).toBe('closing');
    expect(fake.closes).toEqual([{ code: 1000, reason: 'bye' }]);
  });

  it('reaches closed once the backend close event arrives', () => {
    const fake = fakeBackend();
    const host = hostOf(fake.backend);
    const socket = createSocket(host.net.socket, { url: 'ws://x' });
    fake.sink.handleSocketOpen();
    closeSocket(socket);
    fake.sink.handleSocketClose({ code: 1000, reason: '', wasClean: true });
    expect(getSocketReadyState(socket)).toBe('closed');
  });

  it('is a no-op when already closed', () => {
    const fake = fakeBackend();
    const host = hostOf(fake.backend);
    const socket = createSocket(host.net.socket, { url: 'ws://x' });
    fake.sink.handleSocketOpen();
    closeSocket(socket);
    fake.sink.handleSocketClose({ code: 1000, reason: '', wasClean: true });
    closeSocket(socket);
    expect(fake.closes).toHaveLength(1);
  });

  it('stays closed and does not close the connection again after disposal', () => {
    const fake = fakeBackend();
    const host = hostOf(fake.backend);
    const socket = createSocket(host.net.socket, { url: 'ws://x' });
    disposeSocket(socket);
    closeSocket(socket);
    expect(getSocketReadyState(socket)).toBe('closed');
    expect(fake.closes).toHaveLength(1);
  });
});

describe('createSocket', () => {
  it('opens through the backend in the connecting state and records the url', () => {
    const fake = fakeBackend();
    const host = hostOf(fake.backend);
    const socket = createSocket(host.net.socket, { url: 'ws://host/path' });
    expect(socket.url).toBe('ws://host/path');
    expect(getSocketReadyState(socket)).toBe('connecting');
    expect(fake.lastOptions?.url).toBe('ws://host/path');
  });

  it('passes protocols and binaryType through to the backend', () => {
    const fake = fakeBackend();
    const host = hostOf(fake.backend);
    createSocket(host.net.socket, { url: 'ws://x', protocols: ['a', 'b'], binaryType: 'arraybuffer' });
    expect(fake.lastOptions?.protocols).toEqual(['a', 'b']);
    expect(fake.lastOptions?.binaryType).toBe('arraybuffer');
  });

  it('tolerates a null connection from an unsupported transport', () => {
    const fake = fakeBackend();
    fake.openReturnsNull = true;
    const host = hostOf(fake.backend);
    const socket = createSocket(host.net.socket, { url: 'tcp://x' });
    expect(getSocketReadyState(socket)).toBe('connecting');
    expect(sendSocketMessage(socket, 'x')).toBe(false);
  });

  it('emits a text message with binary false and a binary message with binary true', () => {
    const fake = fakeBackend();
    const host = hostOf(fake.backend);
    const socket = createSocket(host.net.socket, { url: 'ws://x' });
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
    const host = hostOf(fake.backend);
    const socket = createSocket(host.net.socket, { url: 'ws://x' });
    const signals = enableSocketSignals(socket);
    const infos: SocketCloseInfo[] = [];
    connectSignal(signals.onSocketClose, (i) => infos.push(i));
    fake.sink.handleSocketClose({ code: 1006, reason: 'gone', wasClean: false });
    expect(infos).toEqual([{ code: 1006, reason: 'gone', wasClean: false }]);
  });

  it('emits onSocketError', () => {
    const fake = fakeBackend();
    const host = hostOf(fake.backend);
    const socket = createSocket(host.net.socket, { url: 'ws://x' });
    const signals = enableSocketSignals(socket);
    let errors = 0;
    connectSignal(signals.onSocketError, () => errors++);
    fake.sink.handleSocketError();
    expect(errors).toBe(1);
  });
});

describe('detachSocket', () => {
  it('stops backend events from reaching the signals', () => {
    const fake = fakeBackend();
    const host = hostOf(fake.backend);
    const socket = createSocket(host.net.socket, { url: 'ws://x' });
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
    const host = hostOf(fake.backend);
    const socket = createSocket(host.net.socket, { url: 'ws://x' });
    const signals = enableSocketSignals(socket);
    let messages = 0;
    connectSignal(signals.onSocketMessage, () => messages++);
    fake.sink.handleSocketOpen();
    disposeSocket(socket);
    expect(fake.closes).toHaveLength(1);
    expect(socket.runtime.connection).toBeNull();
    expect(getSocketReadyState(socket)).toBe('closed');
    fake.sink.handleSocketMessage({ data: 'x', binary: false });
    expect(messages).toBe(0);
  });

  it('is safe to call on a fresh socket', () => {
    const fake = fakeBackend();
    const host = hostOf(fake.backend);
    const socket = createSocket(host.net.socket, { url: 'ws://x' });
    expect(() => disposeSocket(socket)).not.toThrow();
  });
});

describe('enableSocketSignals', () => {
  it('returns the same group on repeated calls', () => {
    const fake = fakeBackend();
    const host = hostOf(fake.backend);
    const socket = createSocket(host.net.socket, { url: 'ws://x' });
    expect(enableSocketSignals(socket)).toBe(enableSocketSignals(socket));
  });

  it('leaves a bare socket without signals', () => {
    const fake = fakeBackend();
    const host = hostOf(fake.backend);
    const socket = createSocket(host.net.socket, { url: 'ws://x' });
    expect(socket.runtime.signals).toBeNull();
  });

  it('returns an inert stable group without reviving a disposed socket', () => {
    const fake = fakeBackend();
    const host = hostOf(fake.backend);
    const socket = createSocket(host.net.socket, { url: 'ws://x' });
    disposeSocket(socket);
    const first = enableSocketSignals(socket);
    expect(enableSocketSignals(socket)).toBe(first);
    expect(socket.runtime.delivering).toBe(false);
    expect(getSocketReadyState(socket)).toBe('closed');
  });
});

describe('getSocketReadyState', () => {
  it('reflects connecting → open → closing → closed transitions', () => {
    const fake = fakeBackend();
    const host = hostOf(fake.backend);
    const socket = createSocket(host.net.socket, { url: 'ws://x' });
    expect(getSocketReadyState(socket)).toBe('connecting');
    fake.sink.handleSocketOpen();
    expect(getSocketReadyState(socket)).toBe('open');
    closeSocket(socket);
    expect(getSocketReadyState(socket)).toBe('closing');
    fake.sink.handleSocketClose({ code: 1000, reason: '', wasClean: true });
    expect(getSocketReadyState(socket)).toBe('closed');
  });
});

describe('openTcpSocket', () => {
  it('forwards the endpoint unchanged and returns the backend connection by identity', () => {
    const expected = tcpConnection();
    const options: TcpSocketOptions = { host: 'db.internal', port: 5432 };
    const openTcpSocketBackend = vi.fn(() => expected);
    const backend: HostSocketCapability = {
      openSocket: vi.fn(() => null),
      openTcpSocket: openTcpSocketBackend,
    };

    expect(openTcpSocket(hostOf(backend).net.socket, options)).toBe(expected);
    expect(openTcpSocketBackend).toHaveBeenCalledWith(options);
  });

  it('returns null when the host carries no socket backend', () => {
    const host = { net: {} } as { readonly net: { readonly socket: HostSocketCapability } };
    expect(openTcpSocket(host.net.socket, { host: 'localhost', port: 9000 })).toBeNull();
  });

  // A framed-only provider — the shape every browser transport takes — omits openTcpSocket entirely.
  // Raw TCP must then report absence rather than falling through to openSocket and reinterpreting the
  // endpoint as a WebSocket URL.
  it('returns null for a framed-only backend without attempting framed openSocket', () => {
    const backend: HostSocketCapability = { openSocket: vi.fn(() => null) };
    const openSocket = vi.spyOn(backend, 'openSocket');

    expect(openTcpSocket(hostOf(backend).net.socket, { host: 'localhost', port: 9000 })).toBeNull();
    expect(openSocket).not.toHaveBeenCalled();
  });

  it('preserves an explicit null from a backend that cannot open the endpoint', () => {
    const backend: HostSocketCapability = {
      openSocket: vi.fn(() => null),
      openTcpSocket: vi.fn(() => null),
    };

    expect(openTcpSocket(hostOf(backend).net.socket, { host: 'unreachable.internal', port: 22 })).toBeNull();
  });
});

describe('sendSocketMessage', () => {
  it('sends through the connection and returns true when open', () => {
    const fake = fakeBackend();
    const host = hostOf(fake.backend);
    const socket = createSocket(host.net.socket, { url: 'ws://x' });
    fake.sink.handleSocketOpen();
    expect(sendSocketMessage(socket, 'ping')).toBe(true);
    expect(fake.sent).toEqual(['ping']);
  });

  it('returns false without throwing when not open', () => {
    const fake = fakeBackend();
    const host = hostOf(fake.backend);
    const socket = createSocket(host.net.socket, { url: 'ws://x' });
    expect(sendSocketMessage(socket, 'ping')).toBe(false);
    expect(fake.sent).toEqual([]);
  });

  it('returns false after disposal without reaching the released connection', () => {
    const fake = fakeBackend();
    const host = hostOf(fake.backend);
    const socket = createSocket(host.net.socket, { url: 'ws://x' });
    fake.sink.handleSocketOpen();
    disposeSocket(socket);
    expect(sendSocketMessage(socket, 'ping')).toBe(false);
    expect(fake.sent).toEqual([]);
  });

  it('returns false for an open state whose backend supplied no connection', () => {
    const fake = fakeBackend();
    fake.openReturnsNull = true;
    const host = hostOf(fake.backend);
    const socket = createSocket(host.net.socket, { url: 'tcp://x' });
    fake.sink.handleSocketOpen();
    expect(getSocketReadyState(socket)).toBe('open');
    expect(sendSocketMessage(socket, 'ping')).toBe(false);
  });

  it('forwards binary data by identity and propagates false without mutating the readonly socket', () => {
    const fake = fakeBackend();
    fake.sendReturns = false;
    const host = hostOf(fake.backend);
    const socket = createSocket(host.net.socket, { url: 'ws://x' });
    fake.sink.handleSocketOpen();
    Object.freeze(socket.runtime);
    Object.freeze(socket);
    const frame = new Uint8Array([1, 2, 3]).buffer;
    expect(sendSocketMessage(socket, frame)).toBe(false);
    expect(fake.sent[0]).toBe(frame);
  });
});

describe('setSocketGuard', () => {
  it('installs and removes the core notice hook', () => {
    const notices: string[] = [];
    setSocketGuard((notice) => notices.push(`${notice.operation}:${notice.reason}`));
    const unsupported = fakeBackend();
    unsupported.openReturnsNull = true;
    const host = hostOf(unsupported.backend);
    createSocket(host.net.socket, { url: 'tcp://x' });

    const supported = fakeBackend();
    const socket = createSocket(hostOf(supported.backend).net.socket, { url: 'ws://x' });
    disposeSocket(socket);
    closeSocket(socket);
    sendSocketMessage(socket, 'x');
    enableSocketSignals(socket);
    setSocketGuard(null);
    closeSocket(socket);

    expect(notices).toEqual([
      'createSocket:no-connection',
      'closeSocket:disposed',
      'sendSocketMessage:disposed',
      'enableSocketSignals:disposed',
    ]);
  });
});
