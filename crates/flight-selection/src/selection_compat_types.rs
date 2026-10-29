//! flight-compiler: target-native
//! flight-compiler: contract LassoSelection MarqueeSelection MarqueeSelectionMode SelectionModifierState
//! flight-compiler: contract SelectionSignals SelectionState
//! The six public Selection contract types are declared once, in the target-native
//! `selectionCompatTypes.ts`, which the acyclic `contract.selection-types.ts` entry and the
//! `selectionCompat.ts` wrappers both re-export. Rust declares the records in `types`; nothing is needed
//! here.
