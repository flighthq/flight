# flight-permissions

Read-only permission queries and explicit permission requests over caller-supplied capability
records. The crate never resolves ambient Web or native permission APIs and never turns a query
into a request that may prompt.

## Source audit

The pinned `permissions/src` package contains the contract and index lanes, the implementation,
and five behavior suites (`geolocationDelegation`, `getPermissionState`, `getPermissionStates`,
`permission`, and `requestPermission`). Its relocated vocabulary also has the pinned
`types/src/Permission.test.ts` suite. The Rust tests preserve those behaviors, including owner
projection, rejected-Promise handling, empty batches, input order, repeated names, concurrent
batch start, and request routes that deliberately do not fall back to reads.

## Ownership and batching

Notification uses `flight-notification`'s canonical permission capability; geolocation requests
use `flight-geolocation`'s canonical access-prompt capability. This crate owns the generic
permissions capability plus the relocated MIDI permission and persistence query/request facets.
Every callback record carries the canonical `flight-host::ProviderRef`; provider
identity is metadata and is never compared or used as a callback key.

`get_permission_states` captures every needed capability before starting any asynchronous work,
starts every query before waiting for completion, and preserves input order and repeated names.
The empty batch returns immediately without reading any owner.

## Outcome projection

Permission names remain open strings. State and reason vocabularies are closed enums with exact
D9 string tables. A geolocation timeout remains a reason-only result because it reports an
acquisition deadline, not a permission decision. Storage's `persistent` policy projects to granted;
`best-effort` preserves the separately observed optional permission state.

## Sugar (D18)

`HostPermissionsCapability` exposes thin delegates for the three public operations. Every owned
enum exposes `parse` and `to_str` delegates. Inline tests compare each method family with its free
function; no behavior lives in the methods.

## Precision and arrays

This package has no numeric or array-valued public contract fields, so it needs no D1 precision
exception and no array-representation decision.
