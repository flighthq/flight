// Generated from crates/flight-useragent/src/lib.rs by flight-compiler.
// Rust is authoritative; run `npm run generate` after changing it.

export {
  DeviceFormFactorCar,
  DeviceFormFactorDesktop,
  DeviceFormFactorPhone,
  DeviceFormFactorTV,
  DeviceFormFactorTablet,
  DeviceFormFactorUnknown,
  DeviceFormFactorWatch,
} from './deviceFormFactor.ts';
export type { DeviceFormFactor } from './deviceFormFactor.ts';
export {
  detectEndianness,
  parseUserAgentArch,
  parseUserAgentEngine,
  parseUserAgentEngineVersion,
  parseUserAgentKind,
  parseUserAgentName,
  parseUserAgentPointerWidth,
  parseUserAgentRuntime,
  parseUserAgentVersion,
} from './userAgent.ts';
export { parseUserAgentFormFactor, parseUserAgentOsName, parseUserAgentOsVersion } from './userAgentParse.ts';
