/* Every built-in renderer producer, of every backend and family, offered by an explicit cast to every
 * consumer of a built-in handle and to the owned renderer free. Only a producer of the consumer's own
 * family is accepted; every other one returns without changing state, and no producer's result is
 * ever freed, so each producer still lends the same live static afterwards. Render states come from
 * the `stand-in-wgpu-host` build. The producer list, FLIGHT_BUILTIN_RENDERER_PRODUCERS, is generated
 * from the header by the test that builds this program.
 *
 * With FLIGHT_FFI_THROUGH_HASHLINK every call goes through the generated HashLink primitives instead,
 * compiled from the shim itself against a stand-in for the HashLink header, so a HashLink caller's
 * cast is refused at runtime just as a C caller's is. */

#include <stdbool.h>
#include <stdint.h>
#include <stdio.h>
#include <string.h>

#include "flight_ffi.h"
#include "flight_builtin_renderer_producers.h"

#ifdef FLIGHT_FFI_THROUGH_HASHLINK
/* The shim passes callbacks through HashLink's byte carriers, converting between object and function
 * pointers as POSIX allows and ISO C does not; that one diagnostic is suspended for the shim alone. */
#pragma GCC diagnostic push
#pragma GCC diagnostic ignored "-Wpedantic"
#include "flight_hl.c"
#pragma GCC diagnostic pop
#define LANE "hashlink"
#define PRODUCE(producer) flight_hl_##producer()
#define REGISTER_WGPU_NODE(state, kind, handle)                                                     \
  flight_hl_flight_register_wgpu_node_renderer((vbyte *)(state), (vbyte *)(kind),                  \
                                               (const FlightBuiltinWgpuNodeRenderer *)(handle))
#define REGISTER_GL_NODE(state, kind, handle)                                                       \
  flight_hl_flight_register_gl_node_renderer((vbyte *)(state), (vbyte *)(kind),                    \
                                             (const FlightBuiltinGlNodeRenderer *)(handle))
#define REGISTER_WGPU_MESH(state, kind, handle)                                                     \
  flight_hl_flight_register_wgpu_mesh_material_renderer(                                            \
      (vbyte *)(state), (vbyte *)(kind), (const FlightBuiltinWgpuMeshMaterialRenderer *)(handle))
#define LOOKUP_WGPU_MESH(state, kind)                                                               \
  flight_hl_flight_get_wgpu_mesh_material_renderer((vbyte *)(state), (vbyte *)(kind))
#define REGISTER_WGPU_QUAD(state, kind, handle)                                                     \
  flight_hl_flight_register_wgpu_quad_material_renderer(                                            \
      (vbyte *)(state), (vbyte *)(kind), (const FlightBuiltinWgpuQuadMaterialRenderer *)(handle))
#define REGISTER_WGPU_PRESET(state, handle)                                                         \
  flight_hl_flight_register_wgpu_render_preset((vbyte *)(state),                                   \
                                               (const FlightBuiltinWgpuRenderPreset *)(handle))
#define FREE_OWNED_QUAD(handle) flight_hl_flight_free_wgpu_quad_material_renderer((vbyte *)(handle))
#else
#define LANE "c"
#define PRODUCE(producer) producer()
#define REGISTER_WGPU_NODE(state, kind, handle)                                                     \
  flight_register_wgpu_node_renderer((state), (kind), (const FlightBuiltinWgpuNodeRenderer *)(handle))
#define REGISTER_GL_NODE(state, kind, handle)                                                       \
  flight_register_gl_node_renderer((state), (kind), (const FlightBuiltinGlNodeRenderer *)(handle))
#define REGISTER_WGPU_MESH(state, kind, handle)                                                     \
  flight_register_wgpu_mesh_material_renderer((state), (kind),                                      \
                                              (const FlightBuiltinWgpuMeshMaterialRenderer *)(handle))
#define LOOKUP_WGPU_MESH(state, kind) flight_get_wgpu_mesh_material_renderer((state), (kind))
#define REGISTER_WGPU_QUAD(state, kind, handle)                                                     \
  flight_register_wgpu_quad_material_renderer((state), (kind),                                      \
                                              (const FlightBuiltinWgpuQuadMaterialRenderer *)(handle))
#define REGISTER_WGPU_PRESET(state, handle)                                                         \
  flight_register_wgpu_render_preset((state), (const FlightBuiltinWgpuRenderPreset *)(handle))
#define FREE_OWNED_QUAD(handle) flight_free_wgpu_quad_material_renderer((void *)(handle))
#endif

typedef struct FlightStandInWgpuRenderReport {
  uint32_t pass_depth;
  bool encoder_open;
  bool render_pass_open;
  bool target_bound;
  uint64_t encoder_serial;
  uint32_t uniform_offset;
  uint32_t quad_batch_count;
  uint64_t uniform_hash;
  uint32_t shape_mesh_pipeline_count;
  uint32_t proxy_count;
  uint64_t proxy_hash;
} FlightStandInWgpuRenderReport;

void *flight_stand_in_create_wgpu_render_state(void);
void *flight_stand_in_create_wgpu_texture_target(const void *state, double width, double height);
void flight_stand_in_destroy_wgpu_render_state(void *state);
void flight_stand_in_destroy_wgpu_render_target(void *target);
bool flight_stand_in_report_wgpu_render_state(const void *state, const void *proxies,
                                              FlightStandInWgpuRenderReport *out);
FlightNode *flight_stand_in_create_solid_shape(uint32_t color, double x, double y, double width,
                                              double height);

typedef struct Producer {
  const char *family;
  const char *name;
  const void *handle;
} Producer;

#define PRODUCER_ENTRY(family, producer) {#family, #producer, NULL},
static Producer producers[] = {FLIGHT_BUILTIN_RENDERER_PRODUCERS(PRODUCER_ENTRY)};
#undef PRODUCER_ENTRY
#define PRODUCER_COUNT (sizeof producers / sizeof producers[0])

static void lend_every_producer(const void **out) {
  size_t index = 0;
#define PRODUCER_CALL(family, producer) out[index++] = (const void *)PRODUCE(producer);
  FLIGHT_BUILTIN_RENDERER_PRODUCERS(PRODUCER_CALL)
#undef PRODUCER_CALL
}

static int check(int ok, const char *what, const char *producer) {
  if (!ok) {
    printf("flight-ffi renderer census (%s): FAILED %s: %s\n", LANE, what, producer);
  }
  return ok;
}

static bool is_family(const Producer *producer, const char *family) {
  return strcmp(producer->family, family) == 0;
}

typedef struct Frame {
  void *state;
  void *target;
  void *proxies;
} Frame;

static Frame create_frame(void) {
  Frame frame;
  frame.state = flight_stand_in_create_wgpu_render_state();
  frame.target = flight_stand_in_create_wgpu_texture_target(frame.state, 16.0, 16.0);
  frame.proxies = flight_create_wgpu_scene_2d_render_proxies();
  flight_register_wgpu_standard_material(frame.state);
  flight_register_standard_wgpu_texture_resolvers(frame.state);
  return frame;
}

static void destroy_frame(Frame *frame) {
  flight_destroy_wgpu_render_state(frame->state, frame->proxies);
  flight_free_wgpu_scene_2d_render_proxies(frame->proxies);
  flight_stand_in_destroy_wgpu_render_target(frame->target);
  flight_stand_in_destroy_wgpu_render_state(frame->state);
}

/* Draws one frame of root; returns the shape pipeline count, or UINT32_MAX when the frame failed. */
static uint32_t draw_frame(const Frame *frame, const FlightNode *root) {
  if (!flight_prepare_wgpu_scene_2d_render(frame->state, frame->proxies, root)) {
    return UINT32_MAX;
  }
  FlightWgpuRenderPassHandle *pass = flight_begin_wgpu_render_pass(frame->state, frame->target, NULL);
  if (pass == NULL) {
    return UINT32_MAX;
  }
  bool drawn = flight_render_wgpu_scene2d(pass, frame->proxies, root, NULL);
  bool ended = flight_end_wgpu_render_pass(pass);
  flight_free_wgpu_render_pass_handle(pass);
  flight_submit_wgpu_frame(frame->state);
  FlightStandInWgpuRenderReport report;
  memset(&report, 0, sizeof report);
  if (!drawn || !ended || !flight_stand_in_report_wgpu_render_state(frame->state, frame->proxies, &report)) {
    return UINT32_MAX;
  }
  return report.shape_mesh_pipeline_count;
}

/* A scene of one solid shape per producer of the families `accept` selects, each of its producer's
 * own kind; returns the root. */
static FlightNode *create_matrix_scene(bool (*accept)(const Producer *)) {
  FlightNode *root = flight_create_display_object();
  for (size_t index = 0; index < PRODUCER_COUNT; index++) {
    if (!accept(&producers[index])) {
      continue;
    }
    char kind[32];
    snprintf(kind, sizeof kind, "probe.Matrix%zu", index);
    FlightNode *shape = flight_stand_in_create_solid_shape(0x3366ccffu, 1.0, 1.0, 4.0, 4.0);
    flight_set_node_kind(shape, kind);
    flight_free_node(flight_add_node_child(root, shape));
    flight_free_node(shape);
  }
  return root;
}

static bool is_not_wgpu_node(const Producer *producer) {
  return !is_family(producer, "FlightBuiltinWgpuNodeRenderer");
}

static bool is_wgpu_shape_renderer(const Producer *producer) {
  return strcmp(producer->name, "flight_get_wgpu_shape_renderer") == 0;
}

int main(void) {
  int ok = 1;
  const void *lent[PRODUCER_COUNT];
  lend_every_producer(lent);
  for (size_t index = 0; index < PRODUCER_COUNT; index++) {
    producers[index].handle = lent[index];
    ok &= check(lent[index] != NULL, "producer lends NULL", producers[index].name);
  }

  /* Node, mesh material and quad material registrars, each producer bound to a kind of its own. */
  Frame frame = create_frame();
  void *gl_state = NULL;
  for (size_t index = 0; index < PRODUCER_COUNT; index++) {
    const Producer *producer = &producers[index];
    char kind[32];
    snprintf(kind, sizeof kind, "probe.Matrix%zu", index);
    REGISTER_WGPU_NODE(frame.state, kind, producer->handle);
    REGISTER_GL_NODE(gl_state, kind, producer->handle);
    REGISTER_WGPU_QUAD(frame.state, kind, producer->handle);
    REGISTER_WGPU_MESH(frame.state, kind, producer->handle);
    const void *bound = (const void *)LOOKUP_WGPU_MESH(frame.state, kind);
    if (is_family(producer, "FlightBuiltinWgpuMeshMaterialRenderer")) {
      ok &= check(bound == producer->handle, "the mesh registrar refused its own family", producer->name);
    } else {
      ok &= check(bound == NULL, "the mesh registrar accepted another family", producer->name);
    }
  }
  FlightNode *foreign_root = create_matrix_scene(is_not_wgpu_node);
  ok &= check(draw_frame(&frame, foreign_root) == 0, "the node registrar accepted another family", "any");
  FlightNode *own_root = create_matrix_scene(is_wgpu_shape_renderer);
  ok &= check(draw_frame(&frame, own_root) == 1, "the node registrar refused its own family", "shape");
  destroy_frame(&frame);

  /* Presets: every other family leaves the state without a shape renderer; its own family binds one. */
  FlightNode *shape_root = flight_create_display_object();
  FlightNode *shape = flight_stand_in_create_solid_shape(0xcc3333ffu, 1.0, 1.0, 5.0, 5.0);
  flight_free_node(flight_add_node_child(shape_root, shape));
  Frame foreign_preset = create_frame();
  Frame own_preset = create_frame();
  for (size_t index = 0; index < PRODUCER_COUNT; index++) {
    const Producer *producer = &producers[index];
    if (is_family(producer, "FlightBuiltinWgpuRenderPreset")) {
      REGISTER_WGPU_PRESET(own_preset.state, producer->handle);
    } else {
      REGISTER_WGPU_PRESET(foreign_preset.state, producer->handle);
    }
  }
  ok &= check(draw_frame(&foreign_preset, shape_root) == 0, "the preset registrar accepted another family", "any");
  ok &= check(draw_frame(&own_preset, shape_root) == 1, "the preset registrar refused its own family", "preset");
  destroy_frame(&foreign_preset);
  destroy_frame(&own_preset);

  /* The owned free, twice over every producer: nothing is released, and every producer still lends the
   * same static afterwards. */
  for (size_t index = 0; index < PRODUCER_COUNT; index++) {
    FREE_OWNED_QUAD(producers[index].handle);
    FREE_OWNED_QUAD(producers[index].handle);
  }
  lend_every_producer(lent);
  for (size_t index = 0; index < PRODUCER_COUNT; index++) {
    ok &= check(lent[index] == producers[index].handle, "a producer changed after the owned free", producers[index].name);
  }
  Frame after = create_frame();
  REGISTER_WGPU_PRESET(after.state, flight_get_wgpu_scene2d_render_preset());
  ok &= check(draw_frame(&after, shape_root) == 1, "the 2D preset no longer draws after the owned free", "preset");
  destroy_frame(&after);

  flight_free_node(shape);
  flight_free_node(shape_root);
  flight_free_node(own_root);
  flight_free_node(foreign_root);
  if (!ok) {
    return 1;
  }
  printf("flight-ffi renderer census (%s): ok %zu\n", LANE, (size_t)PRODUCER_COUNT);
  return 0;
}
