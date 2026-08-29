import type { VideoCapabilityBrowserReport } from './videoCapabilityProbeCore';

export const HostProbeProtocolVersion = 1;

export type HostProbeHost = 'capacitor' | 'electron' | 'tauri' | 'web';
export type HostProbeResultKind = 'provider' | 'render' | 'runtime';
export type HostProbeResultStatus = 'fail' | 'manual' | 'pass' | 'unsupported';

export interface HostProbeResult {
  detail: string;
  id: string;
  kind: HostProbeResultKind;
  status: HostProbeResultStatus;
}

export interface HostProbeReport {
  durationMilliseconds: number;
  finishedAt: string;
  host: HostProbeHost;
  protocolVersion: typeof HostProbeProtocolVersion;
  results: HostProbeResult[];
  startedAt: string;
  status: 'fail' | 'pass';
}

export interface HostProbeInstallResult {
  changedCapabilities: string[];
  results: HostProbeResult[];
}

export interface ElectronHostProbeBridge {
  run(): Promise<HostProbeInstallResult>;
}

declare global {
  interface Window {
    __flightHostProbeReport?: HostProbeReport;
    __flightVideoCapabilityReport?: VideoCapabilityBrowserReport;
    flightHostProbeElectron?: ElectronHostProbeBridge;
  }
}
