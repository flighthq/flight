use crate::types::*;
use flight_entity::{Ref, allocate_entity, get_entity_uid};
use flight_signals::{clear_signal, create_signal, emit_signal};
use std::sync::{Arc, RwLock};

pub fn initialize_share_signals(out: &mut ShareSignals) {
    out.on_share_result = create_signal();
}

// flight-lint: allow(conform-params) D5: source module-global ordered Set is explicit caller-owned state
pub fn attach_share_signals(state: &ShareState, signals: &Ref<ShareSignals>) {
    let uid = get_entity_uid(&mut *signals.write().unwrap());
    let mut data = state.data.write().unwrap();
    if data.attachments.iter().any(|entry| entry.uid == uid) {
        return;
    }
    let order = data.next_order;
    data.next_order += 1;
    data.attachments.push(ShareAttachment {
        uid,
        order,
        signals: signals.clone(),
    });
}

pub fn can_share_content(
    host_share_content: &HostShareContentCapability,
    content: &Ref<ShareContent>,
) -> bool {
    let meaningful = has_share_content_fields(&content.read().unwrap());
    return meaningful && (host_share_content.can_share_content)(content.clone());
}

pub fn can_share_files(
    host_share_files: &HostShareFilesCapability,
    files: &[Ref<ShareFile>],
) -> bool {
    let Some(content) = files_content(files) else {
        return false;
    };
    return (host_share_files.can_share_content)(content);
}

// flight-lint: allow(conform-params) D5: explicit owning state replaces source module-global ordered Set
pub fn detach_share_signals(state: &ShareState, signals: &Ref<ShareSignals>) {
    let uid = get_entity_uid(&mut *signals.write().unwrap());
    state
        .data
        .write()
        .unwrap()
        .attachments
        .retain(|entry| entry.uid != uid);
}

// flight-lint: allow(conform-params) D5: explicit owning state replaces source module-global ordered Set
pub fn dispose_share_signals(state: &ShareState, signals: &Ref<ShareSignals>) {
    detach_share_signals(state, signals);
    let signal = signals.read().unwrap().on_share_result.clone();
    clear_signal(&signal);
}

/// Allocation does not attach: result delivery remains inert until attach_share_signals.
pub fn enable_share_signals() -> Ref<ShareSignals> {
    let mut out: ShareSignals = allocate_entity();
    initialize_share_signals(&mut out);
    return Arc::new(RwLock::new(out));
}

pub fn has_share_content_fields(content: &ShareContent) -> bool {
    let (text, title, url) = match content {
        ShareContent::Title(fields) => (
            fields.text.as_deref(),
            Some(fields.title.as_str()),
            fields.url.as_deref(),
        ),
        ShareContent::Text(fields) => (
            Some(fields.text.as_str()),
            fields.title.as_deref(),
            fields.url.as_deref(),
        ),
        ShareContent::Url(fields) => (
            fields.text.as_deref(),
            fields.title.as_deref(),
            Some(fields.url.as_str()),
        ),
    };
    return title.is_some_and(|value| value != "")
        || text.is_some_and(|value| value != "")
        || url.is_some_and(|value| value != "");
}

pub fn is_share_file_valid(file: &ShareFile) -> bool {
    return file.name != ""
        && file.mime_type != ""
        && file.data_url.starts_with("data:")
        && file.data_url.contains(',');
}

pub async fn share_content(
    host_share_content: &HostShareContentCapability,
    content: &Ref<ShareContent>,
) -> ShareCommandResult {
    if !has_share_content_fields(&content.read().unwrap()) {
        return Ok(false);
    }
    return (host_share_content.share_content)(content.clone()).await;
}

// flight-lint: allow(conform-params) D5: detailed result broadcasts through explicit owning state instead of a source module-global Set
pub async fn share_content_with_result(
    host_share_content: &HostShareContentCapability,
    content: &Ref<ShareContent>,
    state: &ShareState,
) -> ShareOutcome {
    if !has_share_content_fields(&content.read().unwrap()) {
        return Ok(Arc::new(RwLock::new(ShareResult {
            completed: false,
            activity_type: None,
            dismissed: false,
        })));
    }
    let result = (host_share_content.share_content_with_result)(content.clone()).await?;
    let mut cursor = 0;
    loop {
        let next = {
            let data = state.data.read().unwrap();
            data.attachments
                .iter()
                .find(|entry| entry.order >= cursor)
                .map(|entry| (entry.order, entry.signals.clone()))
        };
        let Some((order, signals)) = next else {
            break;
        };
        cursor = order + 1;
        let signal = signals.read().unwrap().on_share_result.clone();
        emit_signal(&signal, &result);
    }
    return Ok(result);
}

pub async fn share_files(
    host_share_files: &HostShareFilesCapability,
    files: &[Ref<ShareFile>],
) -> ShareCommandResult {
    let Some(content) = files_content(files) else {
        return Ok(false);
    };
    return (host_share_files.share_content)(content).await;
}

pub async fn share_text(
    host_share_content: &HostShareContentCapability,
    text: &str,
) -> ShareCommandResult {
    let content = Arc::new(RwLock::new(ShareContent::Text(ShareTextContent {
        text: text.to_string(),
        title: None,
        url: None,
    })));
    return share_content(host_share_content, &content).await;
}

pub async fn share_url(
    host_share_content: &HostShareContentCapability,
    url: &str,
) -> ShareCommandResult {
    let content = Arc::new(RwLock::new(ShareContent::Url(ShareUrlContent {
        text: None,
        title: None,
        url: url.to_string(),
    })));
    return share_content(host_share_content, &content).await;
}

fn files_content(files: &[Ref<ShareFile>]) -> Option<Ref<ShareFilesContent>> {
    if files.is_empty()
        || !files
            .iter()
            .all(|file| is_share_file_valid(&file.read().unwrap()))
    {
        return None;
    }
    return Some(Arc::new(RwLock::new(ShareFilesContent {
        files: files.to_vec(),
        text: None,
        title: None,
        url: None,
    })));
}
