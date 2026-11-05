// Acyclic build entry selected by contract-only projects through the `.lifecycle-types` module suffix.
// The published @flighthq/lifecycle/contract entry remains contract.ts, which also exposes runtime helpers.
export type {
  AppLaunchKind,
  AppLifecycle,
  AppLifecycleState,
  AppMemoryPressure,
  HostLifecycleCapabilities,
  HostLifecycleCapability,
  LifecycleOperation,
} from './types.ts';
