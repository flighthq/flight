// Acyclic build entry selected by contract-only projects through the `.socket-types` module suffix.
// The published @flighthq/socket/contract entry remains contract.ts, which also exposes runtime helpers.
export type {
  HostSocketCapabilities,
  HostSocketCapability,
  Socket,
  SocketCloseInfo,
  SocketConnection,
  SocketEventSink,
  SocketGuard,
  SocketGuardNotice,
  SocketMessage,
  SocketOptions,
  SocketReadyState,
  SocketRuntime,
  SocketSendFailureExplanation,
  SocketSignals,
  TcpSocketConnection,
  TcpSocketOptions,
} from './types.ts';
