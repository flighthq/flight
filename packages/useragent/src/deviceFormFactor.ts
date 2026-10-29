// Generated from crates/flight-useragent/src/device_form_factor.rs by flight-compiler.
// Rust is authoritative; run `npm run generate` after changing it.

/**
 * Device form-factor identifier (TS `DeviceFormFactor`): the physical class of device a host runs
 * on. An OPEN string domain, as in TS: the seven constants below are the known values, and a
 * custom form factor uses a vendor-prefixed string (e.g. "acme.Console").
 */
export type DeviceFormFactor = string;

/**
 * TS `DeviceFormFactorCar`.
 */
export const DEVICE_FORM_FACTOR_CAR = 'Car' as const;

/**
 * TS `DeviceFormFactorDesktop`.
 */
export const DEVICE_FORM_FACTOR_DESKTOP = 'Desktop' as const;

/**
 * TS `DeviceFormFactorPhone`.
 */
export const DEVICE_FORM_FACTOR_PHONE = 'Phone' as const;

/**
 * TS `DeviceFormFactorTablet`.
 */
export const DEVICE_FORM_FACTOR_TABLET = 'Tablet' as const;

/**
 * TS `DeviceFormFactorTV`.
 */
export const DEVICE_FORM_FACTOR_TV = 'TV' as const;

/**
 * TS `DeviceFormFactorUnknown`.
 */
export const DEVICE_FORM_FACTOR_UNKNOWN = 'Unknown' as const;

/**
 * TS `DeviceFormFactorWatch`.
 */
export const DEVICE_FORM_FACTOR_WATCH = 'Watch' as const;
