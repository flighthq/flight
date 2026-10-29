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
export const DeviceFormFactorCar = 'Car' as const;

/**
 * TS `DeviceFormFactorDesktop`.
 */
export const DeviceFormFactorDesktop = 'Desktop' as const;

/**
 * TS `DeviceFormFactorPhone`.
 */
export const DeviceFormFactorPhone = 'Phone' as const;

/**
 * TS `DeviceFormFactorTablet`.
 */
export const DeviceFormFactorTablet = 'Tablet' as const;

/**
 * TS `DeviceFormFactorTV`.
 */
export const DeviceFormFactorTV = 'TV' as const;

/**
 * TS `DeviceFormFactorUnknown`.
 */
export const DeviceFormFactorUnknown = 'Unknown' as const;

/**
 * TS `DeviceFormFactorWatch`.
 */
export const DeviceFormFactorWatch = 'Watch' as const;
