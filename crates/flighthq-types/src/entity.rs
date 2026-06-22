/// Marker trait for SDK entity types.
///
/// Entities are plain data structs with optional runtime state. The runtime
/// holds package-private state (graph linkage, caches, invalidation IDs) that
/// is not part of the public API.
pub trait Entity {}

/// Base runtime state attached to every entity.
///
/// Runtime objects are intentionally opaque to application code. Higher-level
/// subsystems extend the runtime by adding nullable slots for their own state
/// (e.g. `graph_signals`, `image_cache`).
pub trait EntityRuntime {
    /// Optional binding to a platform/host object, or `None`.
    fn binding(&self) -> Option<&dyn std::any::Any>;
}

/// Blanket entity runtime with a single optional binding slot.
pub struct BaseRuntime {
    /// Arbitrary binding, e.g. a DOM element reference on web.
    pub binding: Option<Box<dyn std::any::Any>>,
}

impl std::fmt::Debug for BaseRuntime {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("BaseRuntime")
            .field("has_binding", &self.binding.is_some())
            .finish()
    }
}

impl Default for BaseRuntime {
    fn default() -> Self {
        Self { binding: None }
    }
}

impl EntityRuntime for BaseRuntime {
    fn binding(&self) -> Option<&dyn std::any::Any> {
        self.binding.as_deref()
    }
}
