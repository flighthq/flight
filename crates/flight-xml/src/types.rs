use std::collections::HashMap;

use flight_entity::Ref;

/// Union type for mixed XML content: either literal text or a child element.
///
/// Element entries share the exact child node held by [`XmlElement::children`], matching the
/// TypeScript model where the same object appears in both arrays (`xmlParse.ts`).
///
/// Shared nodes have no value equality; compare two entries with [`std::sync::Arc::ptr_eq`] when
/// identity matters. `XmlContent` therefore has no `PartialEq`.
#[derive(Clone, Debug)]
pub enum XmlContent {
    Text(String),
    Element(Ref<XmlElement>),
}

/// A parsed XML element: tag name, attributes, direct child elements, and text content.
/// `content` preserves the source order of mixed text and elements; `children` and `text`
/// remain the convenient element-only and direct-text projections used by data-oriented
/// XML formats.
///
/// `children` and `content` share one `Ref` per child, so the tree is a single object graph
/// with linear memory, as in TypeScript. `Clone` is shallow for shared children (a new reference
/// to the same node), exactly like copying an object reference in TypeScript.
#[derive(Clone, Debug, Default)]
pub struct XmlElement {
    pub attributes: HashMap<String, String>,
    /// Direct child elements. Text content and comments are discarded as elements.
    pub children: Vec<Ref<XmlElement>>,
    /// Raw direct text nodes and child elements in source order.
    pub content: Vec<XmlContent>,
    pub name: String,
    /// Raw text content (trimmed), concatenation of text nodes.
    pub text: String,
}
