//! D18 Rust conveniences for the image public lane. Every method delegates directly to one public
//! free-function contract; loading, resolution and source-binding behavior remain in that layer.

use std::sync::Arc;

use flight_bitmap::{Bitmap, HostBitmapReadbackCapability, HostImageSource};
use flight_buffer::Blob;
use flight_entity::{Ref, Uint8Array, Unknown};
use flight_image_codec::HostImageDecodeCapabilities;
use flight_stream::AbortSignal;
use flight_surface::Surface;
use flight_texture::{AlphaType, CreateTexture2DOptions, Texture2D, TextureSourceRef};

use crate::contract::*;

#[allow(clippy::items_after_test_module)]
#[cfg(test)]
mod sugar_tests {
    use std::sync::{Arc, RwLock};

    use flight_bitmap::contract::{BitmapReadbackBackendReason, BitmapReadbackOutcome};
    use flight_bitmap::create_bitmap;
    use flight_entity::{FlightError, FlightErrorKind};

    use super::*;

    fn bytes(values: &[u8]) -> Ref<Box<Uint8Array>> {
        return Arc::new(RwLock::new(values.to_vec().into_boxed_slice()));
    }

    fn reference() -> ImageResourceReference {
        return ImageResourceReference::Embedded(EmbeddedImageResourceReferenceValue {
            reference: create_embedded_image_resource_reference(bytes(&[1]), None, None),
        });
    }

    fn state_for(source: &Arc<HostImageSource>) -> ImageResolverState {
        let captured = source.clone();
        let mut state = create_image_resolver_state();
        register_host_image_dimension_resolver(
            &mut state,
            Arc::new(move |actual, out| {
                if !Arc::ptr_eq(actual, &captured) {
                    return false;
                }
                out.height = 2;
                out.width = 3;
                return true;
            }),
        );
        return state;
    }

    #[test]
    fn compressed_image_resource_new_delegates() {
        let compressed = Arc::new(CompressedImageData::default());
        let method = CompressedImageResource::new(compressed.clone());
        let function = create_compressed_image_resource(compressed);
        assert_eq!(method.read().unwrap().kind, function.read().unwrap().kind);
    }

    #[test]
    fn embedded_image_resource_reference_new_delegates() {
        let payload = bytes(&[1, 2]);
        let method = EmbeddedImageResourceReference::new(
            payload.clone(),
            Some("image/png".to_string()),
            Some(AlphaType::Premultiplied),
        );
        let function = create_embedded_image_resource_reference(
            payload,
            Some("image/png".to_string()),
            Some(AlphaType::Premultiplied),
        );
        assert_eq!(
            method.read().unwrap().alpha_type,
            function.read().unwrap().alpha_type
        );
    }

    #[test]
    fn external_image_resource_reference_new_delegates() {
        let method =
            ExternalImageResourceReference::new("a.png".to_string(), Some("/base".to_string()));
        let function = create_external_image_resource_reference(
            "a.png".to_string(),
            Some("/base".to_string()),
        );
        assert_eq!(method.read().unwrap().uri, function.read().unwrap().uri);
    }

    #[test]
    fn image_resource_failure_new_delegates() {
        let cause: Unknown = Some(Arc::new(FlightError {
            kind: FlightErrorKind::Error,
            message: "failed".to_string(),
        }));
        let method = ImageResourceFailure::new(&cause);
        let function = create_image_resource_failure(&cause);
        assert_eq!(
            method.read().unwrap().message,
            function.read().unwrap().message
        );
    }

    #[test]
    fn image_resource_methods_delegate() {
        let source = Arc::new(HostImageSource {
            provider: Arc::new(()),
            handle: Arc::new(()),
        });
        let state = state_for(&source);
        let method = ImageResource::new(source.clone(), &state);
        let function = create_image_resource(source, &state);
        assert_eq!(method.read().unwrap().width, function.read().unwrap().width);
        assert_eq!(method.is_empty(), is_image_resource_empty(&method));
        method.invalidate(&state);
        assert_eq!(method.read().unwrap().version, 1);
        let copy = method.clone_resource();
        assert_eq!(copy.read().unwrap().version, method.read().unwrap().version);
        let readback = HostBitmapReadbackCapability {
            provider: Arc::new(()),
            read_bitmap: Arc::new(|_, width, height, _| {
                return BitmapReadbackOutcome {
                    bitmap: Some(create_bitmap(width, height, None)),
                    reason: BitmapReadbackBackendReason::Ok,
                };
            }),
        };
        let captured = method.capture_bitmap(&readback).unwrap();
        assert_eq!((captured.width, captured.height), (3, 2));
    }

    #[test]
    fn image_resource_reference_methods_delegate() {
        let method_reference = reference();
        let function_reference = reference();
        let method = method_reference.explain_resolution();
        let function = explain_image_resource_reference_resolution(&function_reference);
        assert_eq!(method.state, function.state);
        assert_eq!(
            method_reference.reset_failed(),
            reset_failed_image_resource_reference(&function_reference)
        );
        let texture = method_reference.create_texture(None);
        let ImageResourceReference::Embedded(value) = method_reference else {
            panic!("expected embedded reference");
        };
        assert!(Arc::ptr_eq(
            &value.reference.read().unwrap().textures[0],
            &texture
        ));
        let resolving = reference();
        let fetch: ImageResourceFetch = Arc::new(|_, _| Box::pin(async { None }));
        let resolved = futures::executor::block_on(resolving.resolve(
            &HostImageDecodeCapabilities::default(),
            &fetch,
            &flight_stream::create_abort_controller().signal,
            None,
            &create_image_resolver_state(),
        ));
        assert!(resolved.is_none());
    }

    #[test]
    fn image_url_origin_context_is_same_origin_delegates() {
        let context = ImageUrlOriginContext {
            href: "https://flight.test/a".to_string(),
            origin: "https://flight.test".to_string(),
        };
        assert_eq!(
            context.is_same_origin("/b"),
            is_image_url_same_origin("/b", &context)
        );
    }

    #[test]
    fn resolver_state_new_and_registration_methods_delegate() {
        let mut state = ImageResolverState::new();
        assert!(!has_host_image_dimension_resolver(&state));
        state.register_dimension_resolver(Arc::new(|_, _| true));
        assert!(has_host_image_dimension_resolver(&state));
        state.unregister_dimension_resolver();
        assert!(!has_host_image_dimension_resolver(&state));
    }

    #[test]
    fn host_image_capability_create_from_bitmap_delegates() {
        let source = Arc::new(HostImageSource {
            provider: Arc::new(()),
            handle: Arc::new(()),
        });
        let resource = create_image_resource(source, &create_image_resolver_state());
        let expected = resource.clone();
        let host = HostImageCapability {
            create_image_from_bitmap: Some(Arc::new(move |_| expected.clone())),
            create_image_from_surface: None,
            load_image_from_url: Arc::new(|_, _, _| panic!("unused")),
            provider: Arc::new("provider"),
        };
        let bitmap = create_bitmap(1, 1, None);
        assert!(Arc::ptr_eq(
            &host.create_resource_from_bitmap(&bitmap).unwrap(),
            &resource
        ));
    }
}

pub trait ImageResourceMethods {
    fn capture_bitmap(&self, host_bitmap_readback: &HostBitmapReadbackCapability)
    -> Option<Bitmap>;
    fn clone_resource(&self) -> Ref<ImageResource>;
    fn invalidate(&self, state: &ImageResolverState);
    fn is_empty(&self) -> bool;
}

impl CompressedImageResource {
    pub fn new(compressed: Arc<CompressedImageData>) -> Ref<Self> {
        return create_compressed_image_resource(compressed);
    }
}

impl EmbeddedImageResourceReference {
    pub fn new(
        bytes: Ref<Box<Uint8Array>>,
        mime_type: Option<String>,
        alpha_type: Option<AlphaType>,
    ) -> Ref<Self> {
        return create_embedded_image_resource_reference(bytes, mime_type, alpha_type);
    }
}

impl ExternalImageResourceReference {
    pub fn new(uri: String, base_path: Option<String>) -> Ref<Self> {
        return create_external_image_resource_reference(uri, base_path);
    }
}

impl HostImageCapability {
    pub fn create_resource_from_bitmap(&self, bitmap: &Bitmap) -> Option<Ref<ImageResource>> {
        return create_image_resource_from_bitmap(self, bitmap);
    }

    pub fn create_resource_from_surface(&self, surface: &Surface) -> Option<Ref<ImageResource>> {
        return create_image_resource_from_surface(self, surface);
    }

    pub async fn load_resource_from_base64(
        &self,
        base64: &str,
        mime_type: &str,
        signal: Option<&AbortSignal>,
    ) -> Ref<ImageResource> {
        return load_image_resource_from_base64(self, base64, mime_type, signal).await;
    }

    pub async fn load_resource_from_blob(
        &self,
        blob: &Blob,
        signal: Option<&AbortSignal>,
    ) -> Ref<ImageResource> {
        return load_image_resource_from_blob(self, blob, signal).await;
    }

    pub async fn load_resource_from_bytes(
        &self,
        bytes: &Uint8Array,
        mime_type: Option<&str>,
        signal: Option<&AbortSignal>,
    ) -> Ref<ImageResource> {
        return load_image_resource_from_bytes(self, bytes, mime_type, signal).await;
    }

    pub async fn load_resource_from_url(
        &self,
        url: &str,
        cross_origin: Option<ImageCrossOrigin>,
        signal: Option<&AbortSignal>,
    ) -> Ref<ImageResource> {
        return load_image_resource_from_url(self, url, cross_origin, signal).await;
    }
}

impl ImageResolverState {
    pub fn new() -> Self {
        return create_image_resolver_state();
    }

    pub fn register_bitmap_composition_resolver(
        &mut self,
        resolver: Option<ImageBitmapCompositionResolver>,
    ) {
        return register_image_bitmap_composition_resolver(self, resolver);
    }

    pub fn register_dimension_resolver(&mut self, resolver: HostImageDimensionResolver) {
        return register_host_image_dimension_resolver(self, resolver);
    }

    pub fn unregister_dimension_resolver(&mut self) {
        return unregister_host_image_dimension_resolver(self);
    }
}

impl ImageResource {
    pub fn new(image: Arc<HostImageSource>, state: &ImageResolverState) -> Ref<Self> {
        return create_image_resource(image, state);
    }
}

impl ImageResourceFailure {
    pub fn new(cause: &Unknown) -> Ref<Self> {
        return create_image_resource_failure(cause);
    }
}

impl ImageResourceMethods for Ref<ImageResource> {
    fn capture_bitmap(
        &self,
        host_bitmap_readback: &HostBitmapReadbackCapability,
    ) -> Option<Bitmap> {
        return capture_bitmap_from_image_resource(host_bitmap_readback, self);
    }

    fn clone_resource(&self) -> Ref<ImageResource> {
        return clone_image_resource(self);
    }

    fn invalidate(&self, state: &ImageResolverState) {
        return invalidate_image_resource(self, state);
    }

    fn is_empty(&self) -> bool {
        return is_image_resource_empty(self);
    }
}

impl ImageResourceReference {
    pub fn create_texture(&self, opts: Option<&CreateTexture2DOptions>) -> Ref<Texture2D> {
        return create_texture_from_image_resource(self, opts);
    }

    pub fn explain_resolution(&self) -> ImageResourceReferenceResolutionExplanation {
        return explain_image_resource_reference_resolution(self);
    }

    pub fn reset_failed(&self) -> bool {
        return reset_failed_image_resource_reference(self);
    }

    pub async fn resolve(
        &self,
        image_decode: &HostImageDecodeCapabilities,
        fetch: &ImageResourceFetch,
        signal: &AbortSignal,
        fallback_decode: Option<&ImageDecodeFallback>,
        state: &ImageResolverState,
    ) -> Option<TextureSourceRef> {
        return resolve_image_resource_reference(
            image_decode,
            self,
            fetch,
            signal,
            fallback_decode,
            state,
        )
        .await;
    }
}

impl ImageUrlOriginContext {
    pub fn is_same_origin(&self, url: &str) -> bool {
        return is_image_url_same_origin(url, self);
    }
}
