//! flighthq-resource-formats — resource-format parsing.
//!
//! Port of `@flighthq/resource-formats`. Modules mirror TS filenames 1:1:
//! `xmlParse.ts` -> `xml_parse.rs`. (The texture-atlas parsers migrated out of
//! the TS package; a pending TS rename to `textureatlas-formats` is NOT yet done
//! upstream, so the crate keeps the name `flighthq-resource-formats`. Tracked in
//! `status/resource-formats.md`.)

pub mod xml_parse;

pub use xml_parse::{XmlElement, parse_xml_attributes, parse_xml_document};
