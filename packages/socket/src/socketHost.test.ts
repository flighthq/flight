import type { HostSocketProvider, SocketConnection, SocketEventSink } from '@flighthq/types/contract';

import { createSocket, getSocketReadyState } from './socket';

function recordingBackend(label: string, opened: string[]): HostSocketProvider {
  return {
    openSocket(_options, events: SocketEventSink): SocketConnection | null {
      opened.push(label);
      return {
        closeSocketConnection(): void {},
        sendSocketFrame(): boolean {
          events.handleSocketOpen();
          return true;
        },
      };
    },
  };
}

function hostWith(backend: HostSocketProvider | undefined): { readonly net: { readonly socket: HostSocketProvider } } {
  return { net: backend === undefined ? {} : { socket: backend } } as {
    readonly net: { readonly socket: HostSocketProvider };
  };
}

describe('createSocket', () => {
  it('opens through the provider carried by the host it is given', () => {
    const opened: string[] = [];
    createSocket(hostWith(recordingBackend('a', opened)).net.socket, { url: 'wss://example.test' });
    expect(opened).toEqual(['a']);
  });

  // ★ HOST ISOLATION. Two hosts, two providers, two answers. Under the ambient resolver one
  // process-wide backend answered for every caller, so the second host was unreachable no matter what
  // it carried — this is the property the migration exists to create.
  it('keeps two hosts independent', () => {
    const opened: string[] = [];
    createSocket(hostWith(recordingBackend('first', opened)).net.socket, { url: 'wss://one.test' });
    createSocket(hostWith(recordingBackend('second', opened)).net.socket, { url: 'wss://two.test' });
    expect(opened).toEqual(['first', 'second']);
  });

  // ★ NO AMBIENT FALLBACK. A host that carries no socket provider must yield no connection rather than
  // quietly reaching a process-global web backend. The socket stays 'connecting', which is the
  // documented shape for a backend that cannot open the transport.
  it('yields no connection when the host carries no socket provider', () => {
    const socket = createSocket(hostWith(undefined).net.socket, { url: 'wss://absent.test' });
    expect(socket.runtime.connection).toBeNull();
    expect(getSocketReadyState(socket)).toBe('connecting');
  });

  it('does not consult one host provider when another host is passed', () => {
    const opened: string[] = [];
    const unused = recordingBackend('unused', opened);
    createSocket(hostWith(recordingBackend('used', opened)).net.socket, { url: 'wss://x.test' });
    expect(opened).not.toContain('unused');
    expect(unused).toBeDefined();
  });
});
