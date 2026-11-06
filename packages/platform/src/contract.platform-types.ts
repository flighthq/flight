// Acyclic build entry selected by contract-only projects through the `.platform-types` module suffix.
// The published @flighthq/platform/contract entry remains contract.ts, which also exposes runtime helpers.
export type {
  HostPlatformCapabilities,
  HostPlatformCapability,
  PlatformEndianness,
  PlatformEngine,
  PlatformInfo,
  PlatformKind,
  PlatformName,
  PlatformRuntime,
} from './types.ts';
