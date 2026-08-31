import type {
  DeviceCapabilities,
  DeviceDisplayMetrics,
  DeviceInfo,
  HasSystemDevice,
  SafeAreaInsets,
} from '@flighthq/types/contract';
import { DeviceFormFactorUnknown } from '@flighthq/types/contract';

export function createDeviceCapabilities(): DeviceCapabilities {
  return {
    hasKeyboard: false,
    hasMouse: false,
    hasStylus: false,
  };
}

export function createDeviceDisplayMetrics(): DeviceDisplayMetrics {
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

export function createDeviceInfo(): DeviceInfo {
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

export function createSafeAreaInsets(): SafeAreaInsets {
  return { bottom: 0, left: 0, right: 0, top: 0 };
}

export function getDeviceCapabilities(host: HasSystemDevice, out: DeviceCapabilities): DeviceCapabilities {
  return host.system.device.getCapabilities(out);
}

export function getDeviceDisplayMetrics(host: HasSystemDevice, out: DeviceDisplayMetrics): DeviceDisplayMetrics {
  return host.system.device.getDisplayMetrics(out);
}

export function getDeviceId(host: HasSystemDevice): string {
  return host.system.device.getId();
}

export function getDeviceInfo(host: HasSystemDevice, out: DeviceInfo): DeviceInfo {
  return host.system.device.getInfo(out);
}

export function getSafeAreaInsets(host: HasSystemDevice, out: SafeAreaInsets): SafeAreaInsets {
  return host.system.device.getSafeAreaInsets(out);
}

export function refreshDeviceInfo(host: HasSystemDevice): void {
  host.system.device.refresh?.();
}
