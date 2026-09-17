export interface HostAppExitCapability {
  subscribe(listener: () => void): void;
  unsubscribe(listener: () => void): void;
}
