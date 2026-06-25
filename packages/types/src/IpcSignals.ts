import type { Signal } from './Signal';

// Optional IPC signal group, activated via enableIpcSignals. onBackendChanged fires when the active
// backend is installed or cleared; onChannelMessage fires with the channel name on any incoming message.
export interface IpcSignals {
  onBackendChanged: Signal<() => void>;
  onChannelMessage: Signal<(channel: string) => void>;
}
