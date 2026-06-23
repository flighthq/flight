---
id: purchase
title: '@flighthq/purchase'
type: new-package
target: purchase
status: proposed
tier: bronze
source:
  - tools/agents/docs/reviews/maturation/breadth/purchase.md
  - tools/agents/docs/reviews/breadth/application-platform.md
depends_on: []
updated: 2026-06-23
---

## Summary

In-app purchase / store / entitlements — product catalog, purchase flow, restore, receipt validation, subscription state — over a swappable store backend (App Store / Play / web).

## Scope (this build)

Targeting the **Bronze** tier (see `tier:` above). Advance the marker as tiers complete.

- [ ] Bronze
- [ ] Silver
- [ ] Gold

## Design

### Bronze

The minimum viable store integration: list products, buy one, know if you own it, restore. Enough to ship a single non-consumable or one subscription.

- **Types (in `@flighthq/types` first):**
  - `ProductKind` string identifiers: `'Consumable'`, `'NonConsumable'`, `'AutoRenewableSubscription'`, `'NonRenewingSubscription'` (PascalCase `*Kind` strings; vendor-prefixed for custom).
  - `Product` — plain data: `productId`, `kind: ProductKind`, `title`, `description`, `displayPrice` (localized string), `priceAmountMicros`, `currencyCode`.
  - `PurchaseRequest` — `{ productId; quantity }`.
  - `PurchaseResult` — `{ status: PurchaseStatus; transaction: Transaction | null }`.
  - `PurchaseStatus` string identifiers: `'Purchased'`, `'Cancelled'`, `'Pending'`, `'Failed'`, `'AlreadyOwned'`.
  - `Transaction` — `{ transactionId; productId; purchaseDate; quantity; originalTransactionId }`.
  - `Entitlement` — `{ productId; isActive: boolean; transaction: Transaction | null }`.
  - `PurchaseBackend` trait: `getProducts`, `purchase`, `getEntitlements`, `restore`, `finishTransaction`.
- **Functions (in `@flighthq/purchase`):**
  - `getPurchaseBackend()` / `setPurchaseBackend(backend | null)` / `createWebPurchaseBackend()`.
  - `isPurchaseSupported(): boolean`.
  - `getPurchaseProducts(productIds: readonly string[]): Promise<readonly Product[]>` — catalog query; empty array when unsupported.
  - `purchaseProduct(request: Readonly<PurchaseRequest>): Promise<PurchaseResult>`.
  - `getPurchaseEntitlements(): Promise<readonly Entitlement[]>` — current owned/active set.
  - `hasPurchaseEntitlement(productId: string): Promise<boolean>` — convenience sentinel-returning lookup.
  - `restorePurchases(): Promise<readonly Entitlement[]>`.
  - `finishPurchaseTransaction(transactionId: string): Promise<boolean>` — acknowledge/consume so the store stops re-delivering it (Bronze must expose this; an unacknowledged Play purchase auto-refunds).
- **Effort:** small-to-medium. The web backend is thin; the value is the type header and the seam. Expected failures (no store, user cancel, network) return sentinels — never throw.

### Silver

Competitive with RevenueCat/StoreKit-2-level client APIs: the asynchronous transaction observer, subscriptions with offers, pending/deferred flows, and client-side receipt verification.

- **Types (in `@flighthq/types`):**
  - `PurchaseObserver` — signal entity (the event-capability shape) carrying `onPurchaseUpdated`, `onPurchaseRestored`, `onPurchaseFailed`, `onPurchasePending` signal groups.
  - `SubscriptionPeriod` — `{ unit: SubscriptionPeriodUnit; count }`; `SubscriptionPeriodUnit` strings (`'Day'`/`'Week'`/`'Month'`/`'Year'`).
  - `SubscriptionOffer` — `{ offerId; basePlanId; displayPrice; period; offerKind: SubscriptionOfferKind }` where `SubscriptionOfferKind` is `'Introductory'`/`'FreeTrial'`/`'Promotional'`/`'Upgrade'`/`'Downgrade'`.
  - Extend `Product` with optional `subscriptionPeriod`, `offers: readonly SubscriptionOffer[]`, `subscriptionGroupId`.
  - `SubscriptionState` — `{ productId; status: SubscriptionStatus; expiryDate; willAutoRenew; isInGracePeriod; isInBillingRetry }`; `SubscriptionStatus` strings (`'Active'`/`'Expired'`/`'InGracePeriod'`/`'InBillingRetry'`/`'Revoked'`/`'Paused'`).
  - `PurchaseReceipt` — `{ rawPayload; signature; environment: PurchaseEnvironment }`; `PurchaseEnvironment` (`'Production'`/`'Sandbox'`).
  - `PurchaseError` — `{ code: PurchaseErrorCode; message }` value type (not thrown); `PurchaseErrorCode` strings (`'NetworkError'`/`'StoreUnavailable'`/`'ProductNotFound'`/`'NotAllowed'`/`'PaymentInvalid'`/`'Cancelled'`).
- **Functions (in `@flighthq/purchase`):**
  - `createPurchaseObserver(): PurchaseObserver` / `attachPurchaseObserver(observer)` / `detachPurchaseObserver(observer)` / `disposePurchaseObserver(observer)` — mirrors `updater`'s entity lifecycle; the attach point subscribes to backend-pushed transaction events.
  - `enablePurchaseSignals(observer)` — opt-in signal-group cost (per the signals rule).
  - `purchaseSubscriptionOffer(productId: string, offerId: string): Promise<PurchaseResult>`.
  - `getPurchaseSubscriptionState(productId: string): Promise<SubscriptionState | null>`.
  - `getPurchaseSubscriptions(): Promise<readonly SubscriptionState[]>`.
  - `getPurchaseReceipt(): Promise<PurchaseReceipt | null>` — the app/server's verification payload.
  - `acknowledgePurchaseTransaction(transactionId)` and `consumePurchaseTransaction(transactionId)` — split the Bronze `finish` into the two real store operations.
  - `openPurchaseManagementUrl(productId?: string): Promise<boolean>` — deep-link to the OS subscription-management screen.
- **`@flighthq/purchase-formats` (new neighbor):** `decodeAppStoreReceipt`, `decodeAppStoreJwsTransaction`, `decodePlayPurchase`, `decodePlaySubscriptionPurchase`, `verifyPurchaseReceiptSignature(receipt, certificate): boolean`, `normalizeStoreReceipt(raw, store): PurchaseReceipt`, `normalizeStoreEntitlements(raw, store): readonly Entitlement[]`. Pure value-in/value-out; no store dependency.
- **Effort:** medium-to-large. The observer/signal wiring and the two-store receipt normalization are the bulk; subscription state modeling must reconcile App Store vs Play vocabularies into one `SubscriptionState`.

### Gold

Authoritative: every store concept an expert expects, full error/edge handling, the mobile host realized, and 1:1 Rust parity.

- **Types (in `@flighthq/types`):**
  - `PromotionalOfferSignature` — `{ keyId; nonce; timestamp; signature }` for App Store signed promotional offers.
  - `SubscriptionUpgradePolicy` — `{ replacementMode: SubscriptionReplacementMode; prorate }`; `SubscriptionReplacementMode` strings covering Play's modes (`'WithTimeProration'`/`'ChargeProratedPrice'`/`'ChargeFullPrice'`/`'Deferred'`/`'WithoutProration'`).
  - `PurchaseHistoryRecord` — `{ productId; transaction; purchaseState; quantity }` for full transaction history (distinct from active entitlements).
  - `RefundRequest` / `RefundResult` and `RefundStatus` strings — App Store / Play refund-request flow.
  - `PriceChangeConsent` and `onPriceChange` signal — subscription price-increase consent flow.
  - `WinBackOffer` / `OfferCodeRedemption` — App Store offer codes and win-back offers.
  - `StoreLocation` / `Storefront` — `{ countryCode; storefrontId }` for storefront-aware catalogs.
  - `PurchaseValidationResult` — `{ isValid; reason; environment; latestTransaction }` for the client-side verifier output.
- **Functions (in `@flighthq/purchase`):**
  - `purchaseSubscriptionUpgrade(currentProductId, newProductId, policy: Readonly<SubscriptionUpgradePolicy>): Promise<PurchaseResult>`.
  - `getPurchaseHistory(): Promise<readonly PurchaseHistoryRecord[]>`.
  - `requestPurchaseRefund(transactionId, request): Promise<RefundResult>`.
  - `redeemPurchaseOfferCode(): Promise<boolean>` (App Store presents the system sheet) and `redeemPurchaseOfferCode(code)` for programmatic Play redemption.
  - `presentPurchaseCodeRedemptionSheet(): Promise<boolean>`.
  - `getPurchaseStorefront(): Promise<Storefront | null>` and `onPurchaseStorefrontChange` signal.
  - `getPurchasePromotionalOfferSignature(...)` seam hook for app-server-signed offers.
  - `isPurchaseEligibleForIntroductoryOffer(productId): Promise<boolean>` and `isPurchaseEligibleForWinBackOffer(productId)`.
  - `setPurchasePendingTransactionHandler(handler)` — deferred/Ask-to-Buy and interrupted-purchase recovery so no transaction is ever silently dropped across launches.
  - `simulatePurchase` test seam + an in-memory `createMemoryPurchaseBackend()` for deterministic unit tests (no store, no network).
- **`@flighthq/purchase-formats`:** full StoreKit 2 JWS (ES256) verification with Apple root-cert chain validation, Play Billing v6 RSA signature verification, App Store Server Notifications V2 (`decodeAppStoreServerNotification`) and Play Real-Time Developer Notifications (`decodePlayDeveloperNotification`) decoders, and `getPurchaseValidationResult(receipt): PurchaseValidationResult`.
- **Realization & parity:**
  - `createCapacitorPurchaseBackend` (StoreKit + Play Billing) shipped and exercised — closes the application-platform "no IAP" gap on real devices.
  - Full edge handling: pending → resolved, interrupted purchases on relaunch, grace-period/billing-retry transitions, refund revocation arriving via observer, sandbox-vs-production environment detection, storefront changes mid-session.
  - 1:1 `flighthq-purchase` + `flighthq-purchase-formats` Rust crates; the formats decoders pass the conformance fingerprint suite (deterministic, GPU-free); the live backend conforms via the parity instrument where a store sandbox is available.
  - Tests: colocated unit tests per source file driven by `createMemoryPurchaseBackend`; `purchase-formats` golden-vector tests against captured real Apple/Google payloads.
- **Effort:** large. The formats crate's crypto/cert-chain work and the Capacitor host backend dominate; the main-package surface is mostly additive over Silver.

## Boundaries

- **Server-side receipt validation stays out.** Validating against Apple's `verifyReceipt` / App Store Server API or Google's Play Developer API requires server credentials and a backend service. `purchase-formats` covers only **client-side decode + signature verification** of already-fetched payloads; the round-trip to store servers is the app's backend concern.
- **No entitlement persistence/caching engine.** `purchase` reports entitlement state; persisting it offline belongs to `@flighthq/storage` (and secure tokens to a future secure-credential seam), not here. A thin `getPurchaseEntitlements` cache is acceptable but durable storage is the caller's.
- **No analytics, paywalls, or A/B offer experimentation.** RevenueCat-style paywall UI and remote offer config are an application/product concern, not an SDK capability. The SDK exposes offers as data; rendering a paywall is normal display-object work.
- **No payment processing outside app stores.** Stripe/PayPal/general e-commerce is not store IAP. If wanted, that is a separate `@flighthq/payment` capability with its own seam, not folded in here.
- **Receipt parsing lives in `purchase-formats`, not the main package** — keeps crypto/ASN.1/JWS weight off the default bundle (the "-formats" neighbor rule).
- **Native realization lives in `host-*` packages**, not in `purchase`; the main package ships only the web default and the seam.

## Acceptance

- [ ] Shared types defined in `@flighthq/types` first
- [ ] `npm run check` passes
- [ ] `npm run packages:check` passes (valid manifest, tree-shakable, `sideEffects:false`)
- [ ] Colocated test per export (`npm run exports:check`)
- [ ] `npm run order` / `npm run api` clean
- [ ] Added to the Package Map in `tools/agents/docs/index.md`
- [ ] (Rust-relevant) `npm run rust:conformance` / `npm run mixing:conformance` considered

## Open questions

- **Promise vs out-param for async store calls.** The platform suite already uses `Promise` for inherently-async OS calls (`requestNotificationPermission`, `showNotification`), so `purchase` follows suit — but confirm this is the settled convention for capabilities whose results arrive over a network/IPC, versus the out-param/sentinel style used elsewhere.
- **One `SubscriptionStatus` union or per-store detail.** App Store and Play model grace period, billing retry, and pause differently. Should `SubscriptionState` normalize to one Flight vocabulary (chosen above) with a `nativeStatus` escape field, or expose both? The header-layer "open contract" preference argues for normalized + optional raw.
- **Where does `Storefront`/`StoreLocation` belong** — `purchase`, or shared with a future region/locale concern in `platform`/`device`? Country code already appears in `platform` locale; avoid duplicating the concept.
- **Should `finishPurchaseTransaction` be required in Bronze or deferred to Silver's `acknowledge`/`consume` split?** Spec'd in Bronze because an unacknowledged Play purchase auto-refunds within 3 days — omitting it makes Bronze unsafe — but it adds a concept before subscriptions exist. Confirm the cut.
- **Pending-transaction delivery before observer attach.** Transactions can resolve while the app is closed. Does the backend queue and replay on `attachPurchaseObserver`, or must callers also call `getPurchaseEntitlements` on launch? (Leaning: backend replays queued transactions on attach, matching `updater`'s catch-up semantics.)
- **Test/simulation seam shape.** `createMemoryPurchaseBackend()` vs a `simulatePurchase` hook on the web backend — which is the canonical deterministic-test entry, given the no-top-level-side-effects and tree-shaking rules.

## Agent brief

> Create `@flighthq/purchase` by copying a nearby package's shape, then build it to the **Bronze** tier per the Scope + Design above. Define all shared types in `@flighthq/types` first. Follow the CLAUDE.md conventions (free functions, `Readonly` by default, sentinels over throws, tree-shakable, `-formats`/backend-seam patterns where relevant). Satisfy every Acceptance checkbox. Surface cross-package or design decisions rather than guessing.

## Decision log

- 2026-06-23 — seeded from maturation analysis (status: proposed).
