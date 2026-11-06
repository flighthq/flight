// Acyclic build entry selected by contract-only projects through the `.statusbar-types` module suffix.
// The published @flighthq/statusbar/contract entry remains contract.ts, which also exposes runtime helpers.
export type {
  HostStatusBarCapabilities,
  HostStatusBarChangeCapability,
  HostStatusBarColorCapability,
  HostStatusBarInfoCapability,
  HostStatusBarOverlaysCapability,
  HostStatusBarStyleCapability,
  HostStatusBarVisibilityCapability,
  StatusBar,
  StatusBarAnimation,
  StatusBarInfo,
  StatusBarStyle,
  StatusBarStyleEntry,
  StatusBarStyleEntryHandle,
} from './types.ts';
