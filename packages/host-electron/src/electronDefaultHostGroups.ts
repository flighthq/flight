import type {
  ElectronApi,
  HostAccessibilityCapabilities,
  HostConnectivityCapabilities,
  HostGraphicsCapabilities,
  HostInputCapabilities,
  HostMediaCapabilities,
  HostMidiCapabilities,
  HostNetCapabilities,
  HostShareCapabilities,
  HostTextCapabilities,
  HostUiCapabilities,
} from '@flighthq/types/contract';

// Unsupported groups still have named constructors so the full Electron host has the same explicit
// 26-group composition boundary as every other canonical Host. Empty means absent, never stubbed.
export function electronHostAccessibilityGroup(_electron: ElectronApi): HostAccessibilityCapabilities {
  return {};
}

export function electronHostConnectivity(_electron: ElectronApi): HostConnectivityCapabilities {
  return {};
}

export function electronHostGraphics(_electron: ElectronApi): HostGraphicsCapabilities {
  return {};
}

export function electronHostInput(_electron: ElectronApi): HostInputCapabilities {
  return {};
}

export function electronHostMedia(_electron: ElectronApi): HostMediaCapabilities {
  return {};
}

export function electronHostMidi(_electron: ElectronApi): HostMidiCapabilities {
  return {};
}

export function electronHostNetGroup(_electron: ElectronApi): HostNetCapabilities {
  return {};
}

export function electronHostShare(_electron: ElectronApi): HostShareCapabilities {
  return {};
}

export function electronHostText(_electron: ElectronApi): HostTextCapabilities {
  return {};
}

export function electronHostUi(_electron: ElectronApi): HostUiCapabilities {
  return {};
}
