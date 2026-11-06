// TypeScript-only host capability groups, kept as a target-native companion (see
// crates/flight-host/src/host_capabilities.rs). Each group names capabilities owned by domain
// packages and imported from their contract lanes, so this file never imports @flighthq/types.

import type { HostAccessibilityCapability } from '@flighthq/accessibility/contract';
import type { HostBitmapEncodeCapability, HostBitmapReadbackCapability } from '@flighthq/bitmap/contract';
import type {
  HostCompressDeflateCapability,
  HostCompressLzmaCapability,
  HostDecompressBrotliCapability,
  HostDecompressDeflateCapability,
  HostDecompressLzmaCapability,
} from '@flighthq/compression/contract';
import type {
  HostConnectivityChangeCapability,
  HostConnectivityReachabilityCapability,
  HostConnectivityStatusCapability,
} from '@flighthq/connectivity/contract';
import type {
  HostDirectoryOpenDialogCapability,
  HostFileOpenDialogCapability,
  HostFileSaveDialogCapability,
  HostImageOpenDialogCapability,
  HostMessageDialogCapability,
  HostPhotoCaptureDialogCapability,
  HostPromptDialogCapability,
  HostVideoCaptureDialogCapability,
} from '@flighthq/dialog/contract';
import type { HostFileSystemCapability } from '@flighthq/filesystem/contract';
import type { HostFontLoadingCapability, HostGlyphRasterizerCapability } from '@flighthq/font/contract';
import type { HostGeolocationCapability } from '@flighthq/geolocation/contract';
import type { HostImageCapability } from '@flighthq/image/contract';
import type {
  HostSoftKeyboardAccessoryBarCapability,
  HostSoftKeyboardChangeCapability,
  HostSoftKeyboardInfoCapability,
  HostSoftKeyboardResizeModeWriteCapability,
  HostSoftKeyboardScrollAssistCapability,
  HostSoftKeyboardStyleCapability,
  HostSoftKeyboardVisibilityCapability,
} from '@flighthq/keyboard/contract';
import type { HostMidiAccessCapability, HostMidiPermissionCapability } from '@flighthq/midi/contract';
import type {
  HostNotificationActionCapability,
  HostNotificationActiveListCapability,
  HostNotificationClickCapability,
  HostNotificationCloseCapability,
  HostNotificationDeliveryCapability,
  HostNotificationDismissCapability,
  HostNotificationLifecycleCapability,
  HostNotificationPermissionCapability,
  HostNotificationReceivedCapability,
  HostNotificationReplyCapability,
  HostNotificationSchedulingCapability,
} from '@flighthq/notification/contract';
import type { HostPermissionsCapability } from '@flighthq/permissions/contract';
import type {
  HostProtocolDefaultCapability,
  HostProtocolLaunchCapability,
  HostProtocolOpenCapability,
  HostProtocolRegistrationCapability,
  HostProtocolRegistrationQueryCapability,
  HostProtocolUnregistrationCapability,
} from '@flighthq/protocol/contract';
import type { HostScreenCapabilities } from '@flighthq/screen/contract';
import type { HostShareContentCapability, HostShareFilesCapability } from '@flighthq/share/contract';
import type { HostTextSegmenterCapability } from '@flighthq/textsegment/contract';
import type { HostUpdaterCommandCapability } from '@flighthq/updater/contract';

// Opaque host-side image handle carried across the native seam. The web target aliases the
// platform's drawable-source union; native ports replace this alias with their own borrowed handle.
// Resources never own or free the handle.
export type HostImageSource = CanvasImageSource;

export interface HostBitmapCapabilities {
  readonly encode?: HostBitmapEncodeCapability;
  readonly readback?: HostBitmapReadbackCapability;
}

export interface HostCompressCapabilities {
  readonly deflate?: HostCompressDeflateCapability;
  readonly lzma?: HostCompressLzmaCapability;
}

// Decompression the host supplies, one slot per algorithm. Plain data with named slots, like every
// other Host group: no registry, no ambient lookup, and no import-order dependence — a parser that
// needs to inflate takes the slot (or this group, when the FILE's own bytes select the algorithm) as
// an explicit argument, so what it needs is visible in its signature.
export interface HostDecompressCapabilities {
  readonly brotli?: HostDecompressBrotliCapability;
  readonly deflate?: HostDecompressDeflateCapability;
  readonly lzma?: HostDecompressLzmaCapability;
}

export interface HostDialogCapabilities {
  readonly directoryOpen?: HostDirectoryOpenDialogCapability;
  readonly fileOpen?: HostFileOpenDialogCapability;
  readonly fileSave?: HostFileSaveDialogCapability;
  readonly imageOpen?: HostImageOpenDialogCapability;
  readonly message?: HostMessageDialogCapability;
  readonly photoCapture?: HostPhotoCaptureDialogCapability;
  readonly prompt?: HostPromptDialogCapability;
  readonly videoCapture?: HostVideoCaptureDialogCapability;
}

export interface HostFileSystemCapabilities {
  readonly access?: HostFileSystemCapability;
}

export interface HostFontCapabilities {
  readonly loader?: HostFontLoadingCapability;
}

export interface HostGeolocationCapabilities {
  readonly position?: HostGeolocationCapability;
}

export interface HostGlyphCapabilities {
  readonly rasterizer?: HostGlyphRasterizerCapability;
}

export interface HostImageCapabilities {
  readonly loader?: HostImageCapability;
}

export interface HostMidiCapabilities {
  readonly access?: HostMidiAccessCapability;
  readonly permission?: HostMidiPermissionCapability;
}

export interface HostNotificationCapabilities {
  readonly action?: HostNotificationActionCapability;
  readonly activeList?: HostNotificationActiveListCapability;
  readonly click?: HostNotificationClickCapability;
  readonly close?: HostNotificationCloseCapability;
  readonly delivery?: HostNotificationDeliveryCapability;
  readonly dismiss?: HostNotificationDismissCapability;
  readonly lifecycle?: HostNotificationLifecycleCapability;
  readonly permission?: HostNotificationPermissionCapability;
  readonly received?: HostNotificationReceivedCapability;
  readonly reply?: HostNotificationReplyCapability;
  readonly scheduling?: HostNotificationSchedulingCapability;
}

export interface HostShareCapabilities {
  readonly content?: HostShareContentCapability;
  readonly files?: HostShareFilesCapability;
}

export type WebScreenCapabilities = Required<HostScreenCapabilities>;

export interface HostProtocolCapabilities {
  readonly default?: HostProtocolDefaultCapability;
  readonly launch?: HostProtocolLaunchCapability;
  readonly open?: HostProtocolOpenCapability;
  readonly registration?: HostProtocolRegistrationCapability;
  readonly registrationQuery?: HostProtocolRegistrationQueryCapability;
  readonly unregistration?: HostProtocolUnregistrationCapability;
}

export interface HostUpdaterCapabilities {
  readonly command?: HostUpdaterCommandCapability;
}

export interface HostPermissionsCapabilities {
  readonly query?: HostPermissionsCapability;
}

export interface HostConnectivityCapabilities {
  readonly change?: HostConnectivityChangeCapability;
  readonly reachability?: HostConnectivityReachabilityCapability;
  readonly status?: HostConnectivityStatusCapability;
}

// Provider-issued numeric host ids (crates/flight-host/src/numeric_handles.rs, rust-only there): branded
// numbers a host issues and alone interprets.
export type AudioBufferHandle = number & { readonly __brand: 'AudioBufferHandle' };

export type AudioDeviceHandle = number & { readonly __brand: 'AudioDeviceHandle' };

export type AudioSourceHandle = number & { readonly __brand: 'AudioSourceHandle' };

export type AudioBusNodeHandle = number & { readonly __brand: 'AudioBusNodeHandle' };

export type AudioMixerGraphHandle = number & { readonly __brand: 'AudioMixerGraphHandle' };

export interface HostAccessibilityCapabilities {
  readonly tree?: HostAccessibilityCapability;
}

export interface HostSoftKeyboardCapabilities {
  readonly accessoryBar?: HostSoftKeyboardAccessoryBarCapability;
  readonly change?: HostSoftKeyboardChangeCapability;
  readonly info?: HostSoftKeyboardInfoCapability;
  readonly resizeModeWrite?: HostSoftKeyboardResizeModeWriteCapability;
  readonly scrollAssist?: HostSoftKeyboardScrollAssistCapability;
  readonly style?: HostSoftKeyboardStyleCapability;
  readonly visibility?: HostSoftKeyboardVisibilityCapability;
}

export interface HostTextSegmentCapabilities {
  readonly segmenter?: HostTextSegmenterCapability;
}
