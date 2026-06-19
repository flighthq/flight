// A desktop/system notification request. Named NotificationRequest to avoid colliding with the lib.dom
// global `NotificationOptions`.
export interface NotificationAction {
  id: string;
  title: string;
}

export interface NotificationRequest {
  title: string;
  body?: string;
  icon?: string;
  tag?: string;
  silent?: boolean;
  actions?: NotificationAction[];
}

// System notification seam. Free functions in @flighthq/notification delegate to the active backend
// (web Notification default or a native host's). notify/requestPermission resolve to false when the host
// lacks the surface or the user denies, rather than throwing — denial is an expected outcome, not an error.
export interface NotificationBackend {
  notify(request: Readonly<NotificationRequest>): Promise<boolean>;
  requestPermission(): Promise<boolean>;
  isSupported(): boolean;
  subscribeClick(listener: (tag: string) => void): () => void;
  subscribeAction(listener: (tag: string, actionId: string) => void): () => void;
}
