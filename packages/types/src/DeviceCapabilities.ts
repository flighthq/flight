// Input/hardware capability flags for the running device, filled by DeviceBackend.getCapabilities.
// Only surfaces capabilities with no dedicated package owner; richer pointer/keyboard event handling
// lives in @flighthq/input and @flighthq/interaction. Unknown capabilities resolve to false.
export interface DeviceCapabilities {
  hasKeyboard: boolean;
  hasMouse: boolean;
  hasStylus: boolean;
}
