export interface HostApplicationExitProvider {
  subscribe(listener: () => void): void;
  unsubscribe(listener: () => void): void;
}
