// Device form-factor identifiers: the physical class of device a host is running on. Used by
// @flighthq/device and its UA-parsing backend (@flighthq/useragent) to classify the host.
export const DeviceFormFactorCar = 'Car';
export const DeviceFormFactorDesktop = 'Desktop';
export const DeviceFormFactorPhone = 'Phone';
export const DeviceFormFactorTablet = 'Tablet';
export const DeviceFormFactorTV = 'TV';
export const DeviceFormFactorUnknown = 'Unknown';
export const DeviceFormFactorWatch = 'Watch';

/** Open string alias for device form-factor identifiers.
 *
 *  Use a vendor-prefixed value (e.g. `'acme.Console'`) for custom form factors to
 *  avoid colliding with built-in kind strings. */
export type DeviceFormFactor = string;
