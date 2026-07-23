import type {
  CapacitorApi,
  CapacitorDeviceInfo,
  DeviceBackend,
  DeviceCapabilities,
  DeviceDisplayMetrics,
  DeviceInfo,
  SafeAreaInsets,
} from '@flighthq/types';
import { DeviceFormFactorPhone, DeviceFormFactorUnknown } from '@flighthq/types';

// Maps Flight's DeviceBackend onto Capacitor's `@capacitor/device`. DeviceBackend reads are synchronous
// out-fills, whereas Capacitor's getInfo/getId are async, so the adapter prefetches both once at
// construction and fills the caller's `out` from the cached values (sentinels — '' / -1 / false — until
// the first probe resolves). Capacitor reports device identity (model, manufacturer, OS, virtual,
// webview), which map onto DeviceInfo; the fields it does not report (arch, memory, GPU, ABIs, board,
// rooted/jailbroken) keep their sentinels. Display metrics, capabilities, and safe-area insets have no
// `@capacitor/device` call, so those out-fills report sentinels too.
export function createCapacitorDeviceBackend(capacitor: CapacitorApi): DeviceBackend {
  const device = capacitor.device;
  // Sync getters over async Capacitor: prefetch identity once and serve the cached values.
  let cachedInfo: CapacitorDeviceInfo | null = null;
  let cachedId = '';
  device
    .getInfo()
    .then((info) => {
      cachedInfo = info;
    })
    .catch(() => {
      /* leave null → sentinels */
    });
  device
    .getId()
    .then((id) => {
      cachedId = id.identifier;
    })
    .catch(() => {
      /* leave '' */
    });
  return {
    getCapabilities(out: DeviceCapabilities): DeviceCapabilities {
      // `@capacitor/device` reports no input capabilities; report the false sentinels.
      out.hasKeyboard = false;
      out.hasMouse = false;
      out.hasStylus = false;
      return out;
    },
    getDisplayMetrics(out: DeviceDisplayMetrics): DeviceDisplayMetrics {
      // No display metrics on `@capacitor/device`; report the -1 sentinels.
      out.colorDepth = -1;
      out.densityDpi = -1;
      out.logicalHeight = -1;
      out.logicalWidth = -1;
      out.physicalHeight = -1;
      out.physicalWidth = -1;
      out.pixelRatio = -1;
      return out;
    },
    getId(): string {
      return cachedId;
    },
    getInfo(out: DeviceInfo): DeviceInfo {
      const info = cachedInfo;
      out.arch = '';
      out.availableMemory = -1;
      out.boardName = '';
      out.colorGamut = '';
      out.cpuCores = -1;
      out.fontScale = -1;
      out.formFactor = toFormFactor(info);
      out.gpuRenderer = '';
      out.gpuVendor = '';
      out.isHdr = false;
      out.isJailbroken = false;
      out.isLowEndDevice = false;
      out.isRooted = false;
      out.isVirtual = info?.isVirtual ?? false;
      out.manufacturer = info?.manufacturer ?? '';
      out.marketingName = info?.name ?? '';
      out.model = info?.model ?? '';
      out.osBuild = '';
      out.osName = info?.operatingSystem ?? '';
      out.osVersion = info?.osVersion ?? '';
      out.platformString = info?.platform ?? '';
      out.productName = info?.model ?? '';
      out.supportedAbis = [];
      out.totalMemory = -1;
      out.webViewVersion = info?.webViewVersion ?? '';
      return out;
    },
    getSafeAreaInsets(out: SafeAreaInsets): SafeAreaInsets {
      // No safe-area call on `@capacitor/device`; report zero insets.
      out.top = 0;
      out.right = 0;
      out.bottom = 0;
      out.left = 0;
      return out;
    },
  };
}

// Capacitor's platform is 'ios' | 'android' | 'web'; a mobile platform is a phone (no tablet signal),
// otherwise unknown. A native host that classifies tablets can override this backend.
function toFormFactor(info: Readonly<CapacitorDeviceInfo> | null): string {
  if (info === null) return DeviceFormFactorUnknown;
  if (info.platform === 'ios' || info.platform === 'android') return DeviceFormFactorPhone;
  return DeviceFormFactorUnknown;
}
