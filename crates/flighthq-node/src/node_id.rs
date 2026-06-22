//! Arena node identifier and arena type alias.
//!
//! Every scene graph node is stored in a `slotmap::SlotMap` keyed by
//! `NodeId`. The type alias `NodeArena<T>` is the standard arena used
//! throughout `flighthq-node` and its consumers.

/// Stable, generational key for a scene graph node stored in a `NodeArena`.
pub type NodeId = slotmap::DefaultKey;

/// Slot-map arena for scene graph nodes of type `T`.
pub type NodeArena<T> = slotmap::SlotMap<NodeId, T>;
