import { allocateEntity, finishEntity } from '@flighthq/entity/contract';
import type {
  DeviceCapabilities,
  DeviceDisplayMetrics,
  DeviceInfo,
  EntityConstruction,
  HasSystemDevice,
  SafeAreaInsets,
} from '@flighthq/types/contract';
import { DeviceFormFactorUnknown } from '@flighthq/types/contract';

export function createDeviceCapabilities(): DeviceCapabilities {
  const out = allocateEntity<DeviceCapabilities>();
  out.hasKeyboard = false;
  out.hasMouse = false;
  out.hasStylus = false;
  return finishEntity(out);
}

export function createDeviceDisplayMetrics(): DeviceDisplayMetrics {
  const out = allocateEntity<DeviceDisplayMetrics>();
  out.colorDepth = -1;
  out.densityDpi = -1;
  out.logicalHeight = -1;
  out.logicalWidth = -1;
  out.physicalHeight = -1;
  out.physicalWidth = -1;
  out.pixelRatio = -1;
  return finishEntity(out);
}

export function createDeviceInfo(): DeviceInfo {
  const out = allocateEntity<DeviceInfo>();
  out.arch = '';
  out.availableMemory = -1;
  out.boardName = '';
  out.colorGamut = '';
  out.cpuCores = -1;
  out.fontScale = -1;
  out.formFactor = DeviceFormFactorUnknown;
  out.gpuRenderer = '';
  out.gpuVendor = '';
  out.isHdr = false;
  out.isJailbroken = false;
  out.isLowEndDevice = false;
  out.isRooted = false;
  out.isVirtual = false;
  out.manufacturer = '';
  out.marketingName = '';
  out.model = '';
  out.osBuild = '';
  out.osName = '';
  out.osVersion = '';
  out.platformString = '';
  out.productName = '';
  out.supportedAbis = [];
  out.totalMemory = -1;
  out.webViewVersion = '';
  return finishEntity(out);
}

export function createSafeAreaInsets(): SafeAreaInsets {
  const out = allocateEntity<SafeAreaInsets>();
  out.bottom = 0;
  out.left = 0;
  out.right = 0;
  out.top = 0;
  return finishEntity(out);
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
