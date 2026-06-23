---
id: biometrics
title: '@flighthq/biometrics'
type: new-package
target: biometrics
status: proposed
tier: bronze
source:
  - tools/agents/docs/reviews/maturation/breadth/biometrics.md
  - tools/agents/docs/reviews/breadth/application-platform.md
depends_on: []
updated: 2026-06-23
---

## Summary

Biometric authentication and OS-backed secure credential storage: a Touch ID / Face ID / fingerprint prompt, and a keychain/keystore-encrypted secret store, distinct from the plaintext `@flighthq/storage` key/value seam.

## Scope (this build)

Targeting the **Bronze** tier (see `tier:` above). Advance the marker as tiers complete.

- [ ] Bronze
- [ ] Silver
- [ ] Gold

## Design

### Bronze

The minimum that closes the gap the review names: an auth prompt and a secret store an app can actually use for auth tokens. Types land in `@flighthq/types` first.

- **Types (`@flighthq/types`).**
  - `BiometricKind` — string kind identifier vocabulary: `'TouchId' | 'FaceId' | 'Fingerprint' | 'Iris' | 'None'` (canonical PascalCase strings; vendor-prefixed for custom).
  - `BiometricAvailability` — `Readonly<{ available: boolean; kind: BiometricKind; enrolled: boolean }>` (distinguishes "device has no sensor" from "sensor present but no enrolled identity").
  - `BiometricPromptRequest` — `Readonly<{ reason: string; cancelTitle?: string; fallbackTitle?: string; allowDeviceCredential?: boolean }>` (`reason` is the OS-shown rationale string; `allowDeviceCredential` lets PIN/passcode satisfy the prompt).
  - `BiometricAuthResult` — `Readonly<{ ok: boolean; kind: BiometricKind; usedDeviceCredential: boolean }>`.
  - `SecureStoreItemDescriptor` — `Readonly<{ key: string; requireAuthentication?: boolean }>` (per-item flag: read gated behind a biometric prompt vs. stored-but-not-gated).
  - `BiometricsBackend` — the seam interface declaring the methods the functions below dispatch to.
- **Capability + auth (`@flighthq/biometrics`, free functions over the active backend).**
  - `isBiometricsSupported(): boolean` — synchronous presence check (mirrors `isNotificationSupported`).
  - `getBiometricAvailability(): Promise<BiometricAvailability>` — async because the OS query may prompt/permission-check; returns `available:false, kind:'None'` rather than throwing when unavailable.
  - `authenticateBiometric(request: Readonly<BiometricPromptRequest>): Promise<BiometricAuthResult>` — show the prompt; resolves `ok:false` on user cancel/failure (expected failure → sentinel, not throw).
- **Secure store (`@flighthq/biometrics`).**
  - `setSecureStoreItem(descriptor: Readonly<SecureStoreItemDescriptor>, value: string): Promise<boolean>` — encrypt + persist; `false` on failure.
  - `getSecureStoreItem(descriptor: Readonly<SecureStoreItemDescriptor>): Promise<string | null>` — decrypt (prompting if `requireAuthentication`); `null` when missing, cancelled, or unavailable.
  - `removeSecureStoreItem(key: string): Promise<boolean>`.
  - `hasSecureStoreItem(key: string): Promise<boolean>`.
- **Seam (`@flighthq/biometrics`).**
  - `getBiometricsBackend(): BiometricsBackend`, `setBiometricsBackend(backend: BiometricsBackend | null): void`, `createWebBiometricsBackend(): BiometricsBackend`.
- **Host adapter (`@flighthq/host-electron`).** `createElectronBiometricsBackend(electron): BiometricsBackend` over `safeStorage` + `systemPreferences.promptTouchID`.

### Silver

Competitive with a well-regarded native secure-auth library; covers professional auth flows, key-bound credentials, and cross-backend consistency.

- **Types (`@flighthq/types`).**
  - `SecureStoreItemMetadata` — `Readonly<{ key: string; createdAt: number; requiresAuthentication: boolean; synchronizable: boolean }>` for listing without decrypting.
  - `BiometricAuthError` kind — `'Cancelled' | 'Failed' | 'LockedOut' | 'NotEnrolled' | 'NotAvailable' | 'PasscodeNotSet'` carried on `BiometricAuthResult.error` so callers branch on _why_ without exceptions.
  - `SecureStoreAccessPolicy` kind — `'WhenUnlocked' | 'AfterFirstUnlock' | 'WhenPasscodeSet'` (maps to keychain accessibility / keystore unlock requirements).
  - `SecureCredential` — `Readonly<{ key: string; account: string; secret: string }>` for username+secret pairs (the keychain "internet/generic password" shape).
- **Auth refinements.**
  - `getBiometricEnrollmentToken(): Promise<string | null>` — opaque token that changes when the enrolled set changes (lets an app invalidate cached auth if a new fingerprint/face was added — the standard "biometry-change" defense).
  - `authenticateBiometric` honoring `SecureStoreAccessPolicy` and `allowDeviceCredential` fallback consistently across backends.
  - `cancelBiometricPrompt(): boolean` — programmatically dismiss an in-flight prompt.
- **Secure store, professional surface.**
  - `getSecureStoreKeys(): Promise<string[]>` and `getSecureStoreItemMetadata(key): Promise<SecureStoreItemMetadata | null>` — enumerate/inspect without decrypting.
  - `setSecureCredential(credential, descriptor): Promise<boolean>` / `getSecureCredential(key, descriptor): Promise<SecureCredential | null>` — the account+secret pair API.
  - `clearSecureStore(): Promise<boolean>` (mirrors `clearStorage`).
  - Per-item `SecureStoreAccessPolicy` plumbed through `SecureStoreItemDescriptor`.
- **Service scoping.** `setBiometricsServiceName(name: string): void` / `getBiometricsServiceName(): string` — the keychain/keystore service namespace (defaults to `@flighthq/app` identity), so two Flight apps on one device do not collide.
- **Cross-backend consistency.** WebAuthn-backed web path produces the same `BiometricAvailability` / `BiometricAuthResult` shapes as native; documented capability matrix (which fields are real vs. best-effort per backend). Unit tests against a fake `BiometricsBackend` covering cancel, lockout, not-enrolled, and missing-item paths.
- **Rust parity.** `flighthq-biometrics` keyring backend reaching feature parity with the TS native path; parity-suite coverage of the value-typed result/availability shapes (the auth flow itself is host-driven and excluded from deterministic fingerprinting).

### Gold

The authoritative reference for app-side biometric auth + secure storage. Exhaustive, fully error-handled, tested, documented, Rust 1:1.

- **Types (`@flighthq/types`).**
  - `BiometricKey` / `BiometricKeyDescriptor` — a hardware-bound key handle (Secure Enclave / StrongBox / TPM) that never leaves the chip; `{ keyId, algorithm, requiresAuthentication, invalidatedByEnrollment }`.
  - `SecureStoreChangeEvent` — payload for the change signal (`key`, `'set' | 'removed'`).
  - `BiometricsCapabilities` — `Readonly<{ hardwareBacked: boolean; supportsCredentialBinding: boolean; supportsDeviceCredentialFallback: boolean; supportsSigning: boolean }>` for feature-detect-before-use.
- **Hardware-bound keys + signing (the "real" secure-auth path).**
  - `createBiometricKey(descriptor): Promise<BiometricKey | null>` — generate a non-exportable hardware key, optionally biometry-gated.
  - `signWithBiometricKey(keyId, data: Readonly<Uint8Array>, request): Promise<Uint8Array | null>` — auth-gated signature (the WebAuthn assertion / Secure-Enclave-signing primitive that backs passkey-style and server-challenge auth without ever storing a secret).
  - `getBiometricKeyPublicKey(keyId): Promise<Uint8Array | null>`, `destroyBiometricKey(keyId): Promise<boolean>` (`destroy*` — frees a non-GC platform resource per the teardown-verb rule).
  - WebAuthn registration/assertion (`createBiometricCredential` / `getBiometricAssertion`) as the web realization of the same key-binding contract.
- **Exhaustive error + edge handling.**
  - Every async function returns sentinels for all expected failures; `BiometricAuthError` covers lockout-with-cooldown, biometry-change invalidation, passcode-removed invalidation, and concurrent-prompt rejection. `getBiometricsCapabilities(): BiometricsCapabilities` for capability gating.
  - Documented re-entrancy rule: a second `authenticateBiometric` while one is pending resolves `ok:false, error:'Cancelled'` (no native double-prompt).
- **Signals (opt-in group).** `enableBiometricsSignals(): BiometricsSignals` exposing `onSecureStoreChange` (multi-listener, priority, opt-in cost per the signals rule) and `onBiometricEnrollmentChange` so an app can react to a new enrolled identity. Defined in this package, not `@flighthq/signals`.
- **Migration + portability.** `exportSecureStoreItem` is deliberately _absent_ (hardware-bound secrets must not be exportable); instead `migrateSecureStoreItem(key, accessPolicy)` re-stores under a new policy. Documented data-at-rest guarantees per backend.
- **Full host coverage.** `host-electron` (`safeStorage` + `promptTouchID` + `canPromptTouchID`), `host-tauri` (keychain/`secret-service` + platform auth), `host-capacitor` (`BiometricPrompt` / `LAContext` + Keystore/Keychain) all implement the full seam including hardware keys where the OS supports them.
- **Rust 1:1.** `flighthq-biometrics` reaches the full surface — keyring secret store, OS auth prompt, and (native) Secure-Enclave/TPM key binding — with the conformance map recording any intentional TS↔Rust divergence (e.g. WebAuthn vs. native signing).
- **Docs + examples.** A worked "store and retrieve an auth token behind Face ID" flow and a "passkey-style challenge signing" flow; capability matrix per backend; explicit non-goals (not a password manager UI, not a crypto library).

## Boundaries

- **Plaintext key/value stays in `@flighthq/storage`.** Biometrics is exclusively the encrypted / auth-gated path; the two never merge, so reading a UI preference does not pull keychain code into the bundle.
- **No general-purpose cryptography.** This package exposes hardware-bound key _handles_ and OS signing/encryption only. Bulk encryption, hashing, JWT parsing, OAuth flows, and password hashing are out — an app uses a crypto library or `@flighthq/net` for those.
- **No auth UI / login screens.** This is the OS prompt + secret store seam, not a sign-in component. Rendering a login form is application/display-object territory.
- **No server-side token validation or session management.** Storing a token is here; verifying it against a backend is the app's networking concern.
- **No generic OS permission aggregation.** A unified `@flighthq/permission` (named as a separate review gap) owns cross-capability permission UX; biometrics exposes only its own `getBiometricAvailability`.
- **Concrete native realizations live in `host-*` adapters**, not here — this package ships only the seam + web default, like every other capability in the suite.

## Acceptance

- [ ] Shared types defined in `@flighthq/types` first
- [ ] `npm run check` passes
- [ ] `npm run packages:check` passes (valid manifest, tree-shakable, `sideEffects:false`)
- [ ] Colocated test per export (`npm run exports:check`)
- [ ] `npm run order` / `npm run api` clean
- [ ] Added to the Package Map in `tools/agents/docs/index.md`
- [ ] (Rust-relevant) `npm run rust:conformance` / `npm run mixing:conformance` considered

## Open questions

- **One package or split?** Auth prompt and secure store are separable; a `@flighthq/biometrics` + `@flighthq/securestore` split (with biometrics depending on securestore) would be more orthogonal, but they share one backend seam and the headline feature is auth-gated reads. Leaning single-package with two function families; revisit if the secure store grows independent demand (e.g. non-biometric encrypted storage).
- **Web secure-store fallback honesty.** With no platform keychain in a plain browser, should `setSecureStoreItem` (a) return `false`/`null` (truthful: unavailable), (b) use WebAuthn `largeBlob`/PRF where present, or (c) fall back to encrypted IndexedDB with a clearly non-hardware guarantee? Truthful-`null` is safest; a documented soft fallback is friendlier. Needs a stated default and a per-item opt-out.
- **`requireAuthentication` granularity.** Per-item (in `SecureStoreItemDescriptor`) vs. per-store policy vs. per-read (`getSecureStoreItem(key, { prompt })`). Per-item matches keychain semantics best but adds a field to every call; confirm before locking the type.
- **Hardware-key surface in Bronze?** Signing/key-binding is the most _correct_ auth primitive (no secret to leak) but the heaviest to implement across all hosts. Deferred to Gold here; flag if application-platform considers passkey-style auth table-stakes enough to pull into Silver.
- **Sync vs. async availability.** `isBiometricsSupported` is sync (cheap presence) while `getBiometricAvailability` is async (enrollment query may touch the OS). Confirm this split matches every target host, since some platforms require an async call even for presence.
- **Enrollment-change invalidation contract.** Whether `getBiometricEnrollmentToken` is a Silver convenience or a Gold signal-driven concern — and whether biometry-change should _automatically_ invalidate hardware-bound keys (`invalidatedByEnrollment`) by default.

## Agent brief

> Create `@flighthq/biometrics` by copying a nearby package's shape, then build it to the **Bronze** tier per the Scope + Design above. Define all shared types in `@flighthq/types` first. Follow the CLAUDE.md conventions (free functions, `Readonly` by default, sentinels over throws, tree-shakable, `-formats`/backend-seam patterns where relevant). Satisfy every Acceptance checkbox. Surface cross-package or design decisions rather than guessing.

## Decision log

- 2026-06-23 — seeded from maturation analysis (status: proposed).
