use flight_buffer::ArrayBufferView;
use flight_entity::Unknown;

use crate::font_resource_from::*;
use crate::font_status::*;
use crate::types::*;

#[cfg(test)]
mod sugar_tests {
    use std::future::Future;
    use std::sync::{Arc, Mutex};
    use std::task::{Context, Poll, Waker};

    use flight_buffer::{ArrayBufferViewKind, create_array_buffer, create_array_buffer_view};

    use super::*;

    fn block_on<F: Future>(future: F) -> F::Output {
        let mut future = Box::pin(future);
        let mut context = Context::from_waker(Waker::noop());
        loop {
            match future.as_mut().poll(&mut context) {
                Poll::Ready(value) => return value,
                Poll::Pending => std::thread::yield_now(),
            }
        }
    }

    fn backend(checks: Arc<Mutex<Vec<String>>>) -> HostFontLoadingCapability {
        let provider = Arc::new(()) as flight_host::ProviderRef;
        let face_provider = provider.clone();
        return HostFontLoadingCapability {
            add_font_face: Arc::new(|_| {}),
            check_font_face: Arc::new(move |shorthand| {
                checks.lock().unwrap().push(shorthand.to_string());
                true
            }),
            create_font_face: Arc::new(move |family, _source| {
                Arc::new(FontFace {
                    handle: flight_host::FontFaceHandle {
                        provider: face_provider.clone(),
                        handle: Arc::new(()),
                    },
                    family: family.to_string(),
                })
            }),
            load_font_face: Arc::new(|_| Box::pin(async { Ok(()) })),
            load_font_faces: Arc::new(|_| Box::pin(async { Ok(Vec::new()) })),
            provider,
            when_ready: Arc::new(|| Box::pin(async { Ok(()) })),
        };
    }

    fn bytes() -> ArrayBufferView {
        return create_array_buffer_view(
            &create_array_buffer(1),
            0,
            1,
            ArrayBufferViewKind::Uint8Array,
        )
        .unwrap();
    }

    #[test]
    fn hostfontloadingcapability_is_font_loaded_matches_the_free_function() {
        let method_checks = Arc::new(Mutex::new(Vec::new()));
        let free_checks = Arc::new(Mutex::new(Vec::new()));
        let method = backend(method_checks.clone());
        let free = backend(free_checks.clone());
        assert_eq!(
            method.is_font_loaded("Family", Some("italic")),
            is_font_loaded(&free, "Family", Some("italic"))
        );
        assert_eq!(*method_checks.lock().unwrap(), *free_checks.lock().unwrap());
    }

    #[test]
    fn hostfontloadingcapability_load_resource_from_bytes_matches_the_free_function() {
        let host = backend(Arc::new(Mutex::new(Vec::new())));
        let mut method = crate::font_resource::create_font_resource();
        method.family = "Family".to_string();
        let mut free = crate::font_resource::create_font_resource();
        free.family = "Family".to_string();
        assert!(block_on(host.load_resource_from_bytes(&mut method, &bytes())).is_ok());
        assert!(block_on(load_font_resource_from_bytes(&host, &mut free, &bytes())).is_ok());
        assert_eq!(method.face.unwrap().family, free.face.unwrap().family);
    }

    #[test]
    fn hostfontloadingcapability_load_resource_from_name_matches_the_free_function() {
        let host = backend(Arc::new(Mutex::new(Vec::new())));
        let mut method = crate::font_resource::create_font_resource();
        method.family = "Family".to_string();
        let mut free = crate::font_resource::create_font_resource();
        free.family = "Family".to_string();
        assert!(block_on(host.load_resource_from_name(&mut method)).is_ok());
        assert!(block_on(load_font_resource_from_name(&host, &mut free)).is_ok());
        assert!(method.face.is_none());
        assert!(free.face.is_none());
    }

    #[test]
    fn hostfontloadingcapability_load_resource_from_url_matches_the_free_function() {
        let host = backend(Arc::new(Mutex::new(Vec::new())));
        let mut method = crate::font_resource::create_font_resource();
        method.family = "Family".to_string();
        let mut free = crate::font_resource::create_font_resource();
        free.family = "Family".to_string();
        assert!(block_on(host.load_resource_from_url(&mut method, "font.woff2")).is_ok());
        assert!(block_on(load_font_resource_from_url(&host, &mut free, "font.woff2")).is_ok());
        assert_eq!(method.face.unwrap().family, free.face.unwrap().family);
    }

    #[test]
    fn hostfontloadingcapability_load_resource_from_urls_matches_the_free_function() {
        let host = backend(Arc::new(Mutex::new(Vec::new())));
        let mut method = crate::font_resource::create_font_resource();
        method.family = "Family".to_string();
        let mut free = crate::font_resource::create_font_resource();
        free.family = "Family".to_string();
        let sources = [FontUrl {
            format: None,
            url: "font.woff2".to_string(),
        }];
        assert!(block_on(host.load_resource_from_urls(&mut method, &sources)).is_ok());
        assert!(block_on(load_font_resource_from_urls(&host, &mut free, &sources)).is_ok());
        assert_eq!(method.face.unwrap().family, free.face.unwrap().family);
    }

    #[test]
    fn hostfontloadingcapability_when_fonts_ready_matches_the_free_function() {
        let host = backend(Arc::new(Mutex::new(Vec::new())));
        assert_eq!(
            block_on(host.when_fonts_ready()).is_ok(),
            block_on(when_fonts_ready(&host)).is_ok()
        );
    }
}

impl HostFontLoadingCapability {
    pub fn is_font_loaded(&self, family: &str, style: Option<&str>) -> bool {
        return is_font_loaded(self, family, style);
    }

    pub async fn load_resource_from_bytes(
        &self,
        out: &mut FontResource,
        bytes: &ArrayBufferView,
    ) -> Result<(), Unknown> {
        return load_font_resource_from_bytes(self, out, bytes).await;
    }

    pub async fn load_resource_from_name(&self, out: &mut FontResource) -> Result<(), Unknown> {
        return load_font_resource_from_name(self, out).await;
    }

    pub async fn load_resource_from_url(
        &self,
        out: &mut FontResource,
        url: &str,
    ) -> Result<(), Unknown> {
        return load_font_resource_from_url(self, out, url).await;
    }

    pub async fn load_resource_from_urls(
        &self,
        out: &mut FontResource,
        sources: &[FontUrl],
    ) -> Result<(), Unknown> {
        return load_font_resource_from_urls(self, out, sources).await;
    }

    pub async fn when_fonts_ready(&self) -> Result<(), Unknown> {
        return when_fonts_ready(self).await;
    }
}
