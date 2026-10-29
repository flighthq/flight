mod types;
pub mod xml_native;
mod xml_parse;
mod xml_query;

pub mod contract;

// Public lane: the names exported by the pinned TS `index.ts`, plus the Rust types the public
// signatures require. TS `index.ts` re-exports the whole contract surface, so the lanes match.
pub use contract::XmlContent;
pub use contract::XmlElement;
pub use contract::get_xml_element_attribute;
pub use contract::get_xml_element_attribute_number;
pub use contract::get_xml_element_child_by_name;
pub use contract::get_xml_element_children_by_name;
pub use contract::parse_xml_attributes;
pub use contract::parse_xml_document;
