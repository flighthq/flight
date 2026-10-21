mod share;
mod sugar;
mod types;

pub mod contract;

pub use share::{
    attach_share_signals, can_share_content, can_share_files, detach_share_signals,
    dispose_share_signals, enable_share_signals, has_share_content_fields, is_share_file_valid,
    share_content, share_content_with_result, share_files, share_text, share_url,
};
pub use types::*;

#[cfg(test)]
use crate::contract as share_api;
#[cfg(test)]
#[path = "../tests/common.rs"]
mod test_support;
