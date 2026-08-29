export interface ApplicationExitBackend {
  subscribe(listener: () => void): void;
  unsubscribe(listener: () => void): void;
}
