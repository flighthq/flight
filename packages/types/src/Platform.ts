// Compatibility aggregator: platform owns these contracts. Existing consumers can keep importing
// this module while packages migrate to @flighthq/platform/contract.
/** @deprecated Import platform contracts from `@flighthq/platform/contract`. */
export type {
  HostPlatformCapabilities,
  HostPlatformCapability,
  PlatformEndianness,
  PlatformEngine,
  PlatformInfo,
  PlatformKind,
  PlatformName,
  PlatformRuntime,
} from '@flighthq/platform/contract';
