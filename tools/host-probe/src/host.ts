import type { HostProbeBackendSnapshot } from './capabilityBackends.ts';
import type { HostProbeHost, HostProbeInstallResult } from './contract.ts';

export function resolveHostProbeHost(): HostProbeHost {
  const queryHost = new URLSearchParams(globalThis.location?.search ?? '').get('host');
  const value = queryHost ?? import.meta.env.VITE_HOST_PROBE_HOST ?? 'web';
  if (value === 'capacitor' || value === 'electron' || value === 'tauri' || value === 'web') return value;
  throw new Error(`Unknown host probe target: ${value}`);
}

export async function installHostProbe(
  host: HostProbeHost,
  before: HostProbeBackendSnapshot,
): Promise<HostProbeInstallResult> {
  if (host === 'capacitor') return (await import('./hosts/capacitor.ts')).installCapacitorHostProbe(before);
  if (host === 'electron') return (await import('./hosts/electron.ts')).installElectronHostProbe();
  if (host === 'tauri') return (await import('./hosts/tauri.ts')).installTauriHostProbe(before);
  return (await import('./hosts/web.ts')).installWebHostProbe(before);
}
