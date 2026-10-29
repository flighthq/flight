// Device form-factor identifiers: the physical class of device a host is running on. Used by
// @flighthq/device and its UA-parsing backend (@flighthq/useragent) to classify the host.
export type { DeviceFormFactor } from '@flighthq/useragent/contract';
export {
  DeviceFormFactorCar,
  DeviceFormFactorDesktop,
  DeviceFormFactorPhone,
  DeviceFormFactorTablet,
  DeviceFormFactorTV,
  DeviceFormFactorUnknown,
  DeviceFormFactorWatch,
} from '@flighthq/useragent/contract';
