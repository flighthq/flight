// Minimal cycle bridge for @flighthq/app runtime: render-gl and surface own these host contracts but
// depend on app, so app selects this entry through the `.app-bridge-types` module suffix. Input has no
// app dependency and is intentionally consumed from its owner instead of passing through this bridge.
export type { HostGlCapability } from '@flighthq/render-gl/contract';
export type { HostSurfaceResizeCapability, Surface } from '@flighthq/surface/contract';
