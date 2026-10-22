use crate::{SwfTagHandlerDispatch, SwfTagHandlerRef};

pub fn expand_swf_tag_handler_dispatch(tags: &[SwfTagHandlerRef]) -> SwfTagHandlerDispatch {
    let mut dispatch = SwfTagHandlerDispatch::new();
    for handler in tags {
        for tag in &handler.tags {
            dispatch.insert(*tag, handler.clone());
        }
    }
    return dispatch;
}
