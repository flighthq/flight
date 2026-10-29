// Device form-factor identifiers: the physical class of device a host is running on. Used by
// @flighthq/device and its UA-parsing backend (@flighthq/useragent) to classify the host.
export type { DeviceFormFactor } from '@flighthq/useragent/contract';

export const DeviceFormFactorCar = 'Car';
export const DeviceFormFactorDesktop = 'Desktop';
export const DeviceFormFactorPhone = 'Phone';
export const DeviceFormFactorTablet = 'Tablet';
export const DeviceFormFactorTV = 'TV';
export const DeviceFormFactorUnknown = 'Unknown';
export const DeviceFormFactorWatch = 'Watch';
