use crate::gltf_schema::GltfDocument;
use flight_entity::Ref;

pub struct GltfDocumentSource<'a> {
    pub source: &'a Ref<GltfDocument>,
}

pub struct GltfJsonSource<'a> {
    pub source: &'a str,
}

pub enum GltfSource<'a> {
    Document(GltfDocumentSource<'a>),
    Json(GltfJsonSource<'a>),
}
