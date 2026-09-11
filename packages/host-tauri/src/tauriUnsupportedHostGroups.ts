import type {
  HostAccessibilityCapabilities,
  HostConnectivityCapabilities,
  HostGraphicsCapabilities,
  HostInputCapabilities,
  HostIpcCapabilities,
  HostMediaCapabilities,
  HostMidiCapabilities,
  HostNetCapabilities,
  HostPowerCapabilities,
  HostProtocolCapabilities,
  HostScreenCapabilities,
  HostShareCapabilities,
  HostStorageCapabilities,
  HostTextCapabilities,
  HostUiCapabilities,
  HostUpdaterCapabilities,
} from '@flighthq/types/contract';

// These constructors make the deliberately unsupported Tauri groups explicit. Returning an empty
// group is truthful and keeps capability absence structural rather than installing sentinel providers.
export function tauriHostAccessibility(): HostAccessibilityCapabilities {
  return {};
}

export function tauriHostConnectivity(): HostConnectivityCapabilities {
  return {};
}

export function tauriHostGraphics(): HostGraphicsCapabilities {
  return {};
}

export function tauriHostInput(): HostInputCapabilities {
  return {};
}

export function tauriHostIpc(): HostIpcCapabilities {
  return {};
}

export function tauriHostMedia(): HostMediaCapabilities {
  return {};
}

export function tauriHostMidi(): HostMidiCapabilities {
  return {};
}

export function tauriHostNet(): HostNetCapabilities {
  return {};
}

export function tauriHostPower(): HostPowerCapabilities {
  return {};
}

export function tauriHostProtocol(): HostProtocolCapabilities {
  return {};
}

export function tauriHostScreen(): HostScreenCapabilities {
  return {};
}

export function tauriHostShare(): HostShareCapabilities {
  return {};
}

export function tauriHostStorage(): HostStorageCapabilities {
  return {};
}

export function tauriHostText(): HostTextCapabilities {
  return {};
}

export function tauriHostUi(): HostUiCapabilities {
  return {};
}

export function tauriHostUpdater(): HostUpdaterCapabilities {
  return {};
}
