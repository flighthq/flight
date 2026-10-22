use crate::three_ds_types::{ThreeDsChunkDispatch, ThreeDsChunkDispatchEntry, ThreeDsChunkHandler};
use flight_entity::Ref;

// flight-lint: allow(conform-params) Principal21f7557f approved D24: required first caller-owned collection out, cleared then filled
pub fn build_three_ds_chunk_dispatch(
    out: &mut ThreeDsChunkDispatch,
    handlers: &[Ref<ThreeDsChunkHandler>],
) {
    out.clear();
    for handler in handlers {
        let chunk_ids = handler.read().unwrap().chunk_ids.clone();
        for chunk_id in chunk_ids {
            if let Some(entry) = out.iter_mut().find(|entry| entry.chunk_id == chunk_id) {
                entry.handler = handler.clone();
            } else {
                out.push(ThreeDsChunkDispatchEntry {
                    chunk_id,
                    handler: handler.clone(),
                });
            }
        }
    }
    return;
}
