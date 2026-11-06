// Acyclic build entry selected by contract-only projects through the `.ipc-types` module suffix.
// The published @flighthq/ipc/contract entry remains contract.ts, which also exposes runtime helpers.
export type {
  HostIpcCapabilities,
  HostIpcHandleCapability,
  HostIpcInvokeCapability,
  HostIpcMessageCapability,
  HostIpcSendCapability,
  HostIpcTargetedSendCapability,
} from './types.ts';
