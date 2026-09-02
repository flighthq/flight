import type { SocketBackend, SocketConnection, TcpSocketConnection, TcpSocketOptions } from './index';

describe('TcpSocketConnection', () => {
  it('publishes a byte-stream contract distinct from framed SocketConnection', () => {
    expectTypeOf<keyof TcpSocketConnection>().toEqualTypeOf<'closeTcpSocketConnection' | 'readable' | 'writable'>();
    expectTypeOf<TcpSocketConnection['readable']>().toEqualTypeOf<ReadableStream<Uint8Array>>();
    expectTypeOf<TcpSocketConnection['writable']>().toEqualTypeOf<WritableStream<Uint8Array>>();
    expectTypeOf<TcpSocketConnection['closeTcpSocketConnection']>().toEqualTypeOf<() => void>();
    expectTypeOf<keyof SocketConnection>().toEqualTypeOf<'closeSocketConnection' | 'sendSocketFrame'>();
    expectTypeOf<NonNullable<SocketBackend['openTcpSocket']>>().toEqualTypeOf<
      (options: Readonly<TcpSocketOptions>) => TcpSocketConnection | null
    >();
  });
});

describe('TcpSocketOptions', () => {
  it('names a raw TCP endpoint without WebSocket frame options', () => {
    expectTypeOf<keyof TcpSocketOptions>().toEqualTypeOf<'host' | 'port'>();
    expectTypeOf<TcpSocketOptions['host']>().toEqualTypeOf<string>();
    expectTypeOf<TcpSocketOptions['port']>().toEqualTypeOf<number>();
  });
});
