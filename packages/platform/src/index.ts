export {
  comparePlatformVersions,
  createPlatformInfo,
  getPlatformEngine,
  getPlatformInfo,
  getPlatformKind,
  getPlatformName,
  getPlatformRuntime,
  isPlatformDesktop,
  isPlatformMobile,
  isPlatformNative,
  isPlatformTouch,
  isPlatformVersionAtLeast,
  isPlatformWeb,
} from './platform.ts';

export type {
  HostPlatformCapabilities,
  HostPlatformCapability,
  PlatformEndianness,
  PlatformEngine,
  PlatformInfo,
  PlatformKind,
  PlatformName,
  PlatformRuntime,
} from './contract.ts';
