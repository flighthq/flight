use std::sync::{Arc, Mutex, RwLock};

use flight_buffer::create_array_buffer_from_bytes;
use flight_entity::{Record, Ref};
use flight_net::{HostNetCapability, NetResponse, NetResponseBody, NetState};
use flight_scene3d::Scene3DDocument;

pub(crate) type NetRequests = Arc<Mutex<Vec<String>>>;

pub(crate) fn bytes_body(bytes: &[u8]) -> NetResponseBody {
    return NetResponseBody::Buffer(create_array_buffer_from_bytes(bytes.to_vec().into_boxed_slice()));
}

/// Counts of every document table, so a loaded document can be compared with the parser's own
/// output for the same input.
pub(crate) fn document_shape(document: &Scene3DDocument) -> [usize; 10] {
    return [
        document.animations.len(),
        document.cameras.len(),
        document.lights.len(),
        document.materials.len(),
        document.meshes.len(),
        document.nodes.len(),
        document.resources.len(),
        document.scenes.len(),
        document.skins.len(),
        usize::from(document.metadata.is_some()),
    ];
}

pub(crate) fn net_state() -> NetState {
    return NetState::default();
}

/// A host net capability answering each request URL; `None` is a 404.
pub(crate) fn net_host(
    respond: Arc<dyn Fn(&str) -> Option<NetResponseBody> + Send + Sync>,
) -> (HostNetCapability, NetRequests) {
    let requests: NetRequests = Arc::new(Mutex::new(Vec::new()));
    let recorded = requests.clone();
    let host = HostNetCapability {
        provider: Arc::new(()),
        send_net_request: Arc::new(move |request, _| {
            let url = request.read().unwrap().url.clone();
            recorded.lock().unwrap().push(url.clone());
            let body = respond(&url);
            Box::pin(async move { Ok(response(body)) })
        }),
    };
    return (host, requests);
}

pub(crate) fn text_body(text: &str) -> NetResponseBody {
    return NetResponseBody::Text(text.to_string());
}

fn response(body: Option<NetResponseBody>) -> Ref<NetResponse> {
    let ok = body.is_some();
    return Arc::new(RwLock::new(NetResponse {
        body,
        headers: empty_headers(),
        ok,
        status: if ok { 200 } else { 404 },
        status_text: if ok { "OK" } else { "x" }.to_string(),
        url: "u".to_string(),
    }));
}

/// One external float triangle-less mesh, a camera, a texture image and an unsupported required
/// extension, so one parse shows the buffer bytes, the camera handler, the image base path and the
/// diagnostics sink.
pub(crate) fn gltf_fixture(buffer_uri: Option<&str>) -> String {
    let mesh = match buffer_uri {
        Some(uri) => format!(
            r#","buffers":[{{"byteLength":12,"uri":"{uri}"}}],"bufferViews":[{{"buffer":0,"byteLength":12}}],"accessors":[{{"bufferView":0,"componentType":5126,"count":1,"type":"VEC3","min":[1,2,3],"max":[1,2,3]}}],"meshes":[{{"primitives":[{{"attributes":{{"POSITION":0}}}}]}}]"#
        ),
        None => String::new(),
    };
    let mesh_node = if buffer_uri.is_some() { r#",{"mesh":0}"# } else { "" };
    let scene_nodes = if buffer_uri.is_some() { "[0,1]" } else { "[0]" };
    return format!(
        r#"{{"asset":{{"version":"2.0"}},"extensionsRequired":["ACME_missing"],"extensionsUsed":["ACME_missing"],"cameras":[{{"type":"perspective","perspective":{{"yfov":1,"znear":0.1}}}}],"images":[{{"uri":"skin.png"}}],"textures":[{{"source":0}}],"materials":[{{"pbrMetallicRoughness":{{"baseColorTexture":{{"index":0}}}}}}],"nodes":[{{"camera":0}}{mesh_node}],"scenes":[{{"nodes":{scene_nodes}}}],"scene":0{mesh}}}"#
    );
}

/// A binary glTF container holding only the JSON chunk.
pub(crate) fn glb_bytes(json: &str) -> Vec<u8> {
    let mut chunk = json.as_bytes().to_vec();
    while chunk.len() % 4 != 0 {
        chunk.push(0x20);
    }
    let length = 12 + 8 + chunk.len();
    let mut bytes = Vec::new();
    for word in [0x46546c67_u32, 2, length as u32, chunk.len() as u32, 0x4e4f534a] {
        bytes.extend(word.to_le_bytes());
    }
    bytes.extend(chunk);
    return bytes;
}

pub(crate) fn empty_headers() -> Ref<Record<String>> {
    return Arc::new(RwLock::new(Record::default()));
}

pub(crate) fn float_bytes(values: &[f32]) -> Vec<u8> {
    return values.iter().flat_map(|value| value.to_le_bytes()).collect();
}

pub(crate) fn external_base_paths(document: &Scene3DDocument) -> Vec<Option<String>> {
    return document
        .resources
        .iter()
        .filter_map(|resource| match resource {
            flight_image::ImageResourceReference::External(value) => {
                Some(value.reference.read().unwrap().base_path.clone())
            }
            flight_image::ImageResourceReference::Embedded(_) => None,
        })
        .collect();
}
