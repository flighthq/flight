use crate::contract::*;
use flight_entity::Ref;

impl HostShareContentCapability {
    pub fn can_share(&self, content: &Ref<ShareContent>) -> bool {
        return can_share_content(self, content);
    }

    pub async fn share(&self, content: &Ref<ShareContent>) -> ShareCommandResult {
        return share_content(self, content).await;
    }

    pub async fn share_text(&self, text: &str) -> ShareCommandResult {
        return share_text(self, text).await;
    }

    pub async fn share_url(&self, url: &str) -> ShareCommandResult {
        return share_url(self, url).await;
    }

    pub async fn share_with_result(
        &self,
        content: &Ref<ShareContent>,
        state: &ShareState,
    ) -> ShareOutcome {
        return share_content_with_result(self, content, state).await;
    }
}

impl HostShareFilesCapability {
    pub fn can_share(&self, files: &[Ref<ShareFile>]) -> bool {
        return can_share_files(self, files);
    }

    pub async fn share(&self, files: &[Ref<ShareFile>]) -> ShareCommandResult {
        return share_files(self, files).await;
    }
}

impl ShareContent {
    pub fn has_fields(&self) -> bool {
        return has_share_content_fields(self);
    }
}

impl ShareFile {
    pub fn is_valid(&self) -> bool {
        return is_share_file_valid(self);
    }
}

impl ShareSignals {
    pub fn new() -> Ref<Self> {
        return enable_share_signals();
    }
}

impl ShareState {
    pub fn attach(&self, signals: &Ref<ShareSignals>) {
        return attach_share_signals(self, signals);
    }

    pub fn detach(&self, signals: &Ref<ShareSignals>) {
        return detach_share_signals(self, signals);
    }

    pub fn dispose(&self, signals: &Ref<ShareSignals>) {
        return dispose_share_signals(self, signals);
    }
}
