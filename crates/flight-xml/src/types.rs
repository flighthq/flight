use std::collections::HashMap;

/// Union type for mixed XML content: either literal text or a child element.
#[derive(Clone, Debug, PartialEq)]
pub enum XmlContent {
    Text(String),
    Element(XmlElement),
}

/// A parsed XML element: tag name, attributes, direct child elements, and text content.
/// `content` preserves the source order of mixed text and elements; `children` and `text`
/// remain the convenient element-only and direct-text projections used by data-oriented
/// XML formats.
#[derive(Clone, Debug, Default, PartialEq)]
pub struct XmlElement {
    pub attributes: HashMap<String, String>,
    /// Direct child elements. Text content and comments are discarded as elements.
    pub children: Vec<XmlElement>,
    /// Raw direct text nodes and child elements in source order.
    pub content: Vec<XmlContent>,
    pub name: String,
    /// Raw text content (trimmed), concatenation of text nodes.
    pub text: String,
}
