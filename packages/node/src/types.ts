import type { NodeAny } from '@flighthq/types/contract';

// A shared node identity: the TS counterpart of Rust `flight_node::NodeRef`. It names the existing
// structural node identity while `@flighthq/types` remains the transitional aggregator.
export type NodeRef = NodeAny;
