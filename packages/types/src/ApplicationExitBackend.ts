export interface HostApplicationExitCapability {
  subscribe(listener: () => void): void;
  unsubscribe(listener: () => void): void;
}
