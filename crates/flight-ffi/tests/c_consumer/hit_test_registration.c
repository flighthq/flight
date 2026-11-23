/* Hit-test registration through the C ABI on real nodes: a caller context, default and per-kind
 * registration, caller callbacks for standard and arbitrary custom kinds on both the coarse and
 * precise paths, invalid UTF-8 kinds refused, reentrant use of a context from inside its own
 * callback refused, and every retained callback context released exactly once. */

#include <stdbool.h>
#include <stdint.h>
#include <stdio.h>

#include "flight_ffi.h"

static int failures = 0;

static void check(bool ok, const char *what) {
  if (!ok) {
    printf("flight-ffi hit test registration: FAILED %s\n", what);
    failures += 1;
  }
}

/* A callback context: hits left of `edge`, counting calls and releases. */
typedef struct {
  double edge;
  int calls;
  int releases;
  void *reenter;          /* when set, the callback tries to use this hit test context */
  const FlightNode *node; /* the node the reentrant hit test targets */
  bool reentered_register;
  bool reentered_hit;
} Probe;

static bool coarse(void *ctx, const FlightNode *node, double x, double y) {
  Probe *probe = ctx;
  (void)y;
  probe->calls += 1;
  if (node == NULL) {
    return false;
  }
  if (probe->reenter != NULL) {
    flight_register_hit_test(probe->reenter, "Reentered", coarse, probe, NULL);
    probe->reentered_hit = flight_hit_test_graph_point(probe->reenter, probe->node, x, y);
  }
  return x < probe->edge;
}

static int32_t precise(void *ctx, const FlightNode *node, double x, double y) {
  Probe *probe = ctx;
  (void)node;
  (void)y;
  probe->calls += 1;
  return x < probe->edge ? 0 : -1;
}

static void release(void *ctx) {
  Probe *probe = ctx;
  probe->releases += 1;
}

static FlightNode *hittable(const char *kind) {
  FlightNode *node = flight_create_display_object();
  check(flight_set_node_kind(node, kind), "set node kind");
  flight_set_node_hit_test_enabled(node, true);
  return node;
}

static void custom_kinds(void) {
  void *ctx = flight_create_hit_test_context();
  check(ctx != NULL, "create hit test context");
  FlightNode *node = hittable("vendor.Gauge");
  Probe probe = {.edge = 10.0};

  check(!flight_hit_test_graph_point(ctx, node, 5, 5), "nothing registered misses");
  flight_register_hit_test(ctx, "vendor.Gauge", coarse, &probe, release);
  check(flight_hit_test_graph_point(ctx, node, 5, 5), "custom kind hits inside");
  check(!flight_hit_test_graph_point(ctx, node, 15, 5), "custom kind misses outside");
  check(probe.calls == 2, "custom callback called per test");

  FlightNode *found = flight_find_graph_hit_target(ctx, node, 5, 5);
  check(found != NULL, "find target hits the custom node");
  flight_free_node(found);
  check(flight_find_graph_hit_target(ctx, node, 15, 5) == NULL, "find target misses");

  /* Replacing a kind's callback releases the replaced context once. */
  Probe replacement = {.edge = 20.0};
  flight_register_hit_test(ctx, "vendor.Gauge", coarse, &replacement, release);
  check(probe.releases == 1, "replaced callback released");
  check(flight_hit_test_graph_point(ctx, node, 15, 5), "replacement decides");

  /* Precise path: the precise registry answers first when asked for precision. */
  Probe exact = {.edge = 3.0};
  flight_register_hit_test_precise(ctx, "vendor.Gauge", precise, &exact, release);
  check(flight_hit_test_graph_point_precise(ctx, node, 2, 5), "precise hit");
  check(!flight_hit_test_graph_point_precise(ctx, node, 5, 5), "precise miss");
  check(exact.calls == 2, "precise callback called");

  /* Invalid UTF-8 kinds are refused: nothing is registered and the caller keeps its context. */
  Probe refused = {.edge = 100.0};
  const char invalid[] = {(char)0xff, (char)0xfe, 0};
  flight_register_hit_test(ctx, invalid, coarse, &refused, release);
  flight_register_hit_test_precise(ctx, invalid, precise, &refused, release);
  check(refused.releases == 0, "refused registration keeps the caller's context");

  /* A NULL callback is refused the same way. */
  flight_register_hit_test(ctx, "vendor.Other", NULL, &refused, release);
  check(refused.releases == 0, "NULL callback keeps the caller's context");

  flight_free_node(node);
  flight_free_hit_test_context(ctx);
  check(replacement.releases == 1, "freeing the context releases its callbacks");
  check(exact.releases == 1, "freeing the context releases precise callbacks");
  check(refused.calls == 0, "a refused callback is never called");
}

static void default_and_per_kind_registration(void) {
  void *ctx = flight_create_hit_test_context();
  FlightNode *display = hittable("DisplayObject");
  FlightNode *shape = hittable("Shape");
  Probe display_probe = {.edge = 10.0};
  Probe shape_probe = {.edge = 10.0};
  flight_register_hit_test(ctx, "DisplayObject", coarse, &display_probe, release);
  flight_register_hit_test_precise(ctx, "Shape", precise, &shape_probe, release);
  check(flight_hit_test_graph_point(ctx, display, 5, 5), "caller callback before defaults");
  check(flight_hit_test_graph_point_precise(ctx, shape, 5, 5), "caller precise shape callback");
  check(shape_probe.calls == 1, "caller precise shape callback called");

  /* Per-kind registration installs the built-in handler for its kinds only: the shape kinds'
   * precise fill test. */
  flight_register_shape_hit_test(ctx);
  check(shape_probe.releases == 1, "per-kind registration replaces the caller's shape callback");
  check(display_probe.releases == 0, "per-kind registration leaves other kinds");
  check(!flight_hit_test_graph_point_precise(ctx, shape, 5, 5),
        "built-in shape fill test misses a node with no fill");
  check(shape_probe.calls == 1, "replaced shape callback never called again");

  /* Default registration installs the built-in handlers for every standard kind. */
  flight_register_default_hit_tests(ctx);
  check(display_probe.releases == 1, "defaults replace the caller's display object callback");
  int calls = display_probe.calls;
  check(!flight_hit_test_graph_point(ctx, display, 5, 5), "built-in handler on empty bounds");
  check(display_probe.calls == calls, "replaced display callback never called");

  /* Every other per-kind registration is callable on a live context. */
  flight_register_quad_batch_hit_test(ctx);
  flight_register_text_hit_test(ctx);
  flight_register_tilemap_hit_test(ctx);

  /* A custom kind survives default registration. */
  FlightNode *custom = hittable("vendor.Dial");
  Probe custom_probe = {.edge = 10.0};
  flight_register_hit_test(ctx, "vendor.Dial", coarse, &custom_probe, release);
  flight_register_default_hit_tests(ctx);
  check(flight_hit_test_graph_point(ctx, custom, 5, 5), "custom kind survives defaults");

  flight_free_node(custom);
  flight_free_node(shape);
  flight_free_node(display);
  flight_free_hit_test_context(ctx);
  check(custom_probe.releases == 1, "custom context released with its hit test context");
}

static void hierarchy(void) {
  void *ctx = flight_create_hit_test_context();
  FlightNode *root = flight_create_display_object();
  FlightNode *child = hittable("vendor.Child");
  flight_free_node(flight_add_node_child(root, child));
  Probe probe = {.edge = 10.0};
  flight_register_hit_test(ctx, "vendor.Child", coarse, &probe, release);
  check(flight_hit_test_graph_point(ctx, root, 5, 5), "a child's hit is the root's");
  FlightNode *target = flight_find_graph_hit_target(ctx, root, 5, 5);
  char *kind = target != NULL ? flight_get_node_kind(target) : NULL;
  check(kind != NULL && kind[0] == 'v', "the target is the child");
  flight_free_string(kind);
  flight_free_node(target);
  flight_free_node(child);
  flight_free_node(root);
  flight_free_hit_test_context(ctx);
}

static void reentrancy(void) {
  void *ctx = flight_create_hit_test_context();
  FlightNode *node = hittable("vendor.Reentrant");
  Probe probe = {.edge = 10.0, .reenter = ctx, .node = node};
  flight_register_hit_test(ctx, "vendor.Reentrant", coarse, &probe, release);
  check(flight_hit_test_graph_point(ctx, node, 5, 5), "outer hit test completes");
  check(!probe.reentered_hit, "a hit test from inside a callback on its context is refused");
  check(probe.calls == 1, "the refused inner hit test called nothing");
  check(probe.releases == 0, "the refused inner registration replaced nothing");
  probe.reenter = NULL;
  /* The refused registration of "Reentered" never landed. */
  FlightNode *other = hittable("Reentered");
  check(!flight_hit_test_graph_point(ctx, other, 5, 5), "reentrant registration did not land");
  flight_free_node(other);
  flight_free_node(node);
  flight_free_hit_test_context(ctx);
  check(probe.releases == 1, "reentrant probe released once");
}

static void null_refusal(void) {
  FlightNode *node = hittable("vendor.Null");
  Probe probe = {.edge = 10.0};
  flight_register_hit_test(NULL, "vendor.Null", coarse, &probe, release);
  flight_register_default_hit_tests(NULL);
  check(!flight_hit_test_graph_point(NULL, node, 5, 5), "NULL context misses");
  check(probe.releases == 0 && probe.calls == 0, "NULL context retains nothing");
  flight_free_hit_test_context(NULL);
  flight_free_node(node);
}

int main(void) {
  custom_kinds();
  default_and_per_kind_registration();
  hierarchy();
  reentrancy();
  null_refusal();
  if (failures != 0) {
    return 1;
  }
  printf("flight-ffi hit test registration: ok\n");
  return 0;
}
