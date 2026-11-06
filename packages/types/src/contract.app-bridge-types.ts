// Exact bridge for @flighthq/app runtime: render-gl, input, and surface own these host contracts but
// depend on app, so app selects this entry through the `.app-bridge-types` module suffix.
export type { HostGlCapability } from '@flighthq/render-gl/contract';
export type {
  HostInputDropFileCapability,
  HostInputFocusCapability,
  HostInputPointerLockCapability,
  HostInputTargetCapability,
  InputPointerLockExitOutcome,
  InputPointerLockRequestOutcome,
  InputTargetHandleRaw as InputTargetHandle,
} from '@flighthq/input/contract';
export type { HostSurfaceResizeCapability, Surface } from '@flighthq/surface/contract';
