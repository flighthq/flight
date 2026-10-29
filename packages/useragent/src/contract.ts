// Generated from crates/flight-useragent/src/lib.rs by flight-compiler.
// Rust is authoritative; run `npm run generate` after changing it.

export {
  DEVICE_FORM_FACTOR_CAR,
  DEVICE_FORM_FACTOR_DESKTOP,
  DEVICE_FORM_FACTOR_PHONE,
  DEVICE_FORM_FACTOR_TABLET,
  DEVICE_FORM_FACTOR_TV,
  DEVICE_FORM_FACTOR_UNKNOWN,
  DEVICE_FORM_FACTOR_WATCH,
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
