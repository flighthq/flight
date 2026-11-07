import type { NodeAny } from './contract.node-types.ts';

// A shared node identity: the TS counterpart of Rust `flight_node::NodeRef`. It names the existing
// structural node identity.
export type NodeRef = NodeAny;
