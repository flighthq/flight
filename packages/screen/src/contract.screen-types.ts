// Acyclic build entry selected by contract-only projects through the `.screen-types` module suffix.
// The published @flighthq/screen/contract entry remains contract.ts, which also exposes runtime helpers.
export type {
  HostScreenCapabilities,
  HostScreenChangeCapability,
  HostScreenDetailsCapability,
  HostScreenPermissionChangeCapability,
  HostScreenQueryCapability,
  ScreenChangeEvent,
  ScreenChangedMetrics,
  ScreenChangeKind,
  ScreenColorSpace,
  ScreenInfo,
  ScreenMode,
  ScreenOrientation,
  ScreenPermissionChange,
  ScreenPermissionState,
  ScreenSignals,
} from './types.ts';
