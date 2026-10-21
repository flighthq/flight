//! Temporary holding crate for types whose real owner is not factored out yet (agents/plan.md).
//! Mirrors the TS `@flighthq/unhomed` package until it empties.
//!
//! Rules:
//! - Depends only on the foundation crates: entity, math, geometry, path, color. A type that
//!   needs more than that must get a real home instead.
//! - Every pub item carries `// flight-lint: allow(unhomed) <proposed owner or open question>`,
//!   so `cargo run -p cargo-flight-lint -- allows --rule unhomed` lists the backlog.
