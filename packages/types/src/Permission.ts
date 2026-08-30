// Shared vocabulary projected by @flighthq/permissions from explicit Host capability owners. The
// package is a facade, not a native permission provider: Notification permission, in particular, is
// owned exclusively by Host.notification.permission.

// A named OS/runtime permission. The listed names are the interim shared vocabulary; the open string
// tail lets a caller receive an honest unsupported outcome for a host-specific name.
export type PermissionName =
  | 'camera'
  | 'microphone'
  | 'geolocation'
  | 'notifications'
  | 'clipboard-read'
  | 'clipboard-write'
  | 'persistent-storage'
  | 'push'
  | 'midi'
  | 'screen-wake-lock'
  | (string & {});

// Current projected permission state. 'prompt' means no decision was made; it never means that a
// query silently escalated to a request.
export type PermissionState = 'granted' | 'denied' | 'prompt';

export type PermissionQueryFailureReason = 'operation-failed' | 'runtime-unavailable' | 'unsupported';

// Query is read-only. It never falls through to a request that may prompt, and a failed/unsupported
// query never returns a plausible state.
export type PermissionQueryOutcome =
  | { readonly reason: 'ok'; readonly state: PermissionState }
  // This arm records storage policy state, not a human decision.
  | { readonly reason: 'best-effort'; readonly state: PermissionState | null }
  | { readonly reason: PermissionQueryFailureReason };

// `timeout` is reason-only ON PURPOSE: an owner reporting a timeout observed an acquisition deadline,
// not a decision, so projecting any state from it would invent one. A caller that needs the state
// queries for it explicitly.
export type PermissionRequestFailureReason =
  | 'no-request-route'
  | 'operation-failed'
  | 'runtime-unavailable'
  | 'timeout'
  | 'unsupported';

// Request preserves the owner's decision reason while projecting its common state. cleanup-failed is
// Flight's operational failure after a successful temporary acquisition; it is never user denial.
export type PermissionRequestOutcome =
  | { readonly reason: 'cleanup-failed'; readonly state: 'granted' }
  | { readonly reason: 'denied'; readonly state: 'denied' }
  | { readonly reason: 'dismissed'; readonly state: 'prompt' }
  | { readonly reason: 'granted'; readonly state: 'granted' }
  // This arm records storage policy state, not a human decision.
  | { readonly reason: 'best-effort'; readonly state: PermissionState | null }
  | { readonly reason: PermissionRequestFailureReason };
