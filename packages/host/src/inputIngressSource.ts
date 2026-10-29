// Generated from crates/flight-host/src/input_ingress_source.rs by flight-compiler.
// Rust is authoritative; run `npm run generate` after changing it.

import type { ProviderRef } from './providerRef.ts';

/**
 * The host-neutral identity of one input source. Attachments are keyed by the `Arc` identity of
 * `handle`.
 */
export interface InputIngressSource {
  provider: ProviderRef;
  handle: object;
}
