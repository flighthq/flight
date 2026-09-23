import type {
  DeviceCapabilities,
  DeviceDisplayMetrics,
  DeviceInfo,
  HostDeviceCapability,
  NonEntityCreateResult,
  SafeAreaInsets,
} from '@flighthq/types/contract';
import { DeviceFormFactorUnknown } from '@flighthq/types/contract';

export function createDeviceCapabilities(): NonEntityCreateResult<DeviceCapabilities, 'descriptor'> {
  return { hasKeyboard: false, hasMouse: false, hasStylus: false };
}

export function createDeviceDisplayMetrics(): NonEntityCreateResult<DeviceDisplayMetrics, 'descriptor'> {
  // -1 is the "not reported" sentinel every field starts at, so a host that supplies only some of
  // them leaves the rest visibly unknown rather than reading as a real zero.
  return {
    colorDepth: -1,
    densityDpi: -1,
    logicalHeight: -1,
    logicalWidth: -1,
    physicalHeight: -1,
    physicalWidth: -1,
    pixelRatio: -1,
  };
}

export function createDeviceInfo(): NonEntityCreateResult<DeviceInfo, 'descriptor'> {
  return {
    arch: '',
    availableMemory: -1,
    boardName: '',
    colorGamut: '',
    cpuCores: -1,
    fontScale: -1,
    formFactor: DeviceFormFactorUnknown,
    gpuRenderer: '',
    gpuVendor: '',
    isHdr: false,
    isJailbroken: false,
    isLowEndDevice: false,
    isRooted: false,
    isVirtual: false,
    manufacturer: '',
    marketingName: '',
    model: '',
    osBuild: '',
    osName: '',
    osVersion: '',
    platformString: '',
    productName: '',
    supportedAbis: [],
    totalMemory: -1,
    webViewVersion: '',
  };
}

export function createSafeAreaInsets(): NonEntityCreateResult<SafeAreaInsets, 'descriptor'> {
  return { bottom: 0, left: 0, right: 0, top: 0 };
}

export function getDeviceCapabilities(
  hostDevice: Readonly<HostDeviceCapability>,
  out: DeviceCapabilities,
): DeviceCapabilities {
  return hostDevice.getCapabilities(out);
}

export function getDeviceDisplayMetrics(
  hostDevice: Readonly<HostDeviceCapability>,
  out: DeviceDisplayMetrics,
): DeviceDisplayMetrics {
  return hostDevice.getDisplayMetrics(out);
}

export function getDeviceId(hostDevice: Readonly<HostDeviceCapability>): string {
  return hostDevice.getId();
}

export function getDeviceInfo(hostDevice: Readonly<HostDeviceCapability>, out: DeviceInfo): DeviceInfo {
  return hostDevice.getInfo(out);
}

export function getSafeAreaInsets(hostDevice: Readonly<HostDeviceCapability>, out: SafeAreaInsets): SafeAreaInsets {
  return hostDevice.getSafeAreaInsets(out);
}

export function refreshDeviceInfo(hostDevice: Readonly<HostDeviceCapability>): void {
  hostDevice.refresh?.();
}
