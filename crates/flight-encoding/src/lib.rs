mod utf8;

pub mod contract;

// Public lane equals the contract lane, mirroring TS `index.ts` and `contract.ts`, which both export
// all of utf8.
pub use contract::*;
