import { allocateEntity, finishEntity } from '@flighthq/entity/contract';
import type {
  HostAccessibilityCapabilities,
  HostGraphicsCapabilities,
  HostIpcCapabilities,
  HostMediaCapabilities,
  HostMenuCapabilities,
  HostMidiCapabilities,
  HostNetCapabilities,
  HostPowerCapabilities,
  HostScreenCapabilities,
  HostShellCapabilities,
  HostShortcutCapabilities,
  HostTextCapabilities,
  HostTrayCapabilities,
  HostUpdaterCapabilities,
  HostWindowProvider,
} from '@flighthq/types/contract';

export function capacitorHostAccessibility(): HostAccessibilityCapabilities {
  return {};
}

export function capacitorHostGraphics(): HostGraphicsCapabilities {
  return {};
}

export function capacitorHostIpc(): HostIpcCapabilities {
  return {};
}

export function capacitorHostMedia(): HostMediaCapabilities {
  return {};
}

export function capacitorHostMenu(): HostMenuCapabilities {
  return {};
}

export function capacitorHostMidi(): HostMidiCapabilities {
  return {};
}

export function capacitorHostNet(): HostNetCapabilities {
  return {};
}

export function capacitorHostPower(): HostPowerCapabilities {
  return {};
}

export function capacitorHostScreen(): HostScreenCapabilities {
  return {};
}

export function capacitorHostShell(): HostShellCapabilities {
  return {};
}

export function capacitorHostShortcut(): HostShortcutCapabilities {
  return {};
}

export function capacitorHostText(): HostTextCapabilities {
  return {};
}

export function capacitorHostTray(): HostTrayCapabilities {
  return {};
}

export function capacitorHostUpdater(): HostUpdaterCapabilities {
  return {};
}

export function capacitorHostWindow(): HostWindowProvider {
  return finishEntity(allocateEntity<HostWindowProvider>());
}
