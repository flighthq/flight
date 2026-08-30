import { createWebSocketBackend } from '@flighthq/socket/contract';
import type { SocketBackend } from '@flighthq/types/contract';

// Published on the Host rather than installed into the socket package: a caller selects this
// transport by passing the host that carries it. Only web hosts publish it — no native host here
// implements a socket transport, so none carries a slot that would lie about having one.
export const webSocketBackend: SocketBackend = createWebSocketBackend();
