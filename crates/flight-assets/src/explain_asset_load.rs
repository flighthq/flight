use crate::enums::AssetLoadStatus;
use crate::types::{AssetLibrary, AssetLoadExplanation};
use flight_entity::Ref;

pub fn explain_asset_load(library: &Ref<AssetLibrary>, id: &str) -> AssetLoadExplanation {
    let runtime = library.read().unwrap().library_runtime.clone();
    let descriptor = runtime.read().unwrap().descriptors.get(id).cloned();
    let Some(descriptor) = descriptor else {
        return AssetLoadExplanation {
            id: id.to_string(),
            ref_count: 0,
            status: AssetLoadStatus::MissingDescriptor,
            r#type: None,
        };
    };
    let key = descriptor.read().unwrap().r#type.clone();
    let runtime = runtime.read().unwrap();
    if !runtime.adapters.contains_key(&key) {
        return AssetLoadExplanation {
            id: id.to_string(),
            ref_count: 0,
            status: AssetLoadStatus::MissingLoader,
            r#type: Some(key),
        };
    }
    if let Some(entry) = runtime.entries.get(id) {
        let entry = entry.read().unwrap();
        return AssetLoadExplanation {
            id: id.to_string(),
            ref_count: entry.refcount,
            status: if entry.resident {
                AssetLoadStatus::Resident
            } else {
                AssetLoadStatus::Loading
            },
            r#type: Some(key),
        };
    }
    return AssetLoadExplanation {
        id: id.to_string(),
        ref_count: 0,
        status: if runtime.freed_ids.iter().any(|freed| freed == id) {
            AssetLoadStatus::Freed
        } else {
            AssetLoadStatus::NeverAcquired
        },
        r#type: Some(key),
    };
}
