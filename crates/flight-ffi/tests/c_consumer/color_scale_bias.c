/* ColorScaleBias through the C ABI: lifecycle, every setter, composition, inversion including
 * singular scales, and the out-parameter aliasing contract (an input may be the same object as
 * out). Values are compared exactly with flight_equals_color_scale_bias against references built
 * with flight_set_color_scale_bias; every operand is exactly representable, so exact equality is
 * the specified result, not a tolerance. */

#include <stdbool.h>
#include <stdint.h>
#include <stdio.h>

#include "flight_ffi.h"

static int failures = 0;

static void check(bool ok, const char *what) {
  if (!ok) {
    printf("flight-ffi color scale bias: FAILED %s\n", what);
    failures += 1;
  }
}

static void *make(float rs, float gs, float bs, float as, float rb, float gb, float bb, float ab) {
  void *value = flight_create_color_scale_bias();
  flight_set_color_scale_bias(value, rs, gs, bs, as, rb, gb, bb, ab);
  return value;
}

static bool equals(void *value, float rs, float gs, float bs, float as, float rb, float gb, float bb,
                   float ab) {
  void *expected = make(rs, gs, bs, as, rb, gb, bb, ab);
  bool same = flight_equals_color_scale_bias(value, expected);
  flight_free_color_scale_bias(expected);
  return same;
}

static void lifecycle(void) {
  void *identity = flight_create_color_scale_bias();
  check(identity != NULL, "create returns a handle");
  check(flight_is_identity_color_scale_bias(identity, true), "create is identity");
  check(equals(identity, 1, 1, 1, 1, 0, 0, 0, 0), "create fields");

  void *source = make(0.5f, 2, 4, 0.25f, 0.125f, -1, 3, 0.5f);
  void *clone = flight_clone_color_scale_bias(source);
  check(clone != NULL && clone != source, "clone returns a distinct handle");
  check(flight_equals_color_scale_bias(clone, source), "clone equals its source");
  flight_set_color_scale_bias_identity(source);
  check(equals(clone, 0.5f, 2, 4, 0.25f, 0.125f, -1, 3, 0.5f), "clone is independent of its source");
  check(flight_is_identity_color_scale_bias(source, true), "set identity");

  void *copy = flight_create_color_scale_bias();
  flight_copy_color_scale_bias(copy, clone);
  check(flight_equals_color_scale_bias(copy, clone), "copy");

  flight_free_color_scale_bias(identity);
  flight_free_color_scale_bias(source);
  flight_free_color_scale_bias(clone);
  flight_free_color_scale_bias(copy);
  flight_free_color_scale_bias(NULL);
}

static void setters(void) {
  void *value = flight_create_color_scale_bias();
  flight_set_color_scale_bias_bias_rgb(value, 0xff8000u);
  check(equals(value, 0, 0, 0, 1, 1, 128.0f / 255.0f, 0, 0), "set bias rgb");
  check(flight_get_color_scale_bias_bias_rgb(value) == 0xff8000u, "get bias rgb");

  flight_set_color_scale_bias_bias_rgba(value, 0x00ff8040u);
  check(equals(value, 0, 0, 0, 0, 0, 1, 128.0f / 255.0f, 64.0f / 255.0f), "set bias rgba");
  check(flight_get_color_scale_bias_bias_rgba(value) == 0x00ff8040u, "get bias rgba");

  /* Scales compare with alpha optionally excluded. */
  void *a = make(1, 1, 1, 0.5f, 0, 0, 0, 0);
  check(!flight_is_identity_color_scale_bias(a, true), "alpha scale counts when compared");
  check(flight_is_identity_color_scale_bias(a, false), "alpha scale ignored when not compared");
  void *b = make(1, 1, 1, 1, 0, 0, 0, 0.25f);
  check(!flight_equals_color_scale_bias_biases(a, b, true), "alpha bias counts");
  check(flight_equals_color_scale_bias_biases(a, b, false), "alpha bias ignored");
  check(flight_equals_color_scale_bias_scales(a, b, false), "scales without alpha");
  check(!flight_equals_color_scale_bias_scales(a, b, true), "scales with alpha");
  flight_free_color_scale_bias(a);
  flight_free_color_scale_bias(b);
  flight_free_color_scale_bias(value);
}

static void composition(void) {
  /* concat(out, s, o): scale = s.scale * o.scale; bias = s.scale * o.bias + s.bias. */
  void *s = make(2, 0.5f, 4, 1, 0.25f, 0, -1, 0.5f);
  void *o = make(0.5f, 2, 0.25f, 0.5f, 1, 2, 0.5f, -0.5f);
  void *out = flight_create_color_scale_bias();
  flight_concat_color_scale_bias(out, s, o);
  check(equals(out, 1, 1, 1, 0.5f, 2.25f, 1, 1, 0), "concat");

  /* Composition is not commutative. */
  flight_concat_color_scale_bias(out, o, s);
  check(equals(out, 1, 1, 1, 0.5f, 1.125f, 2, 0.25f, -0.25f), "concat reversed");

  /* Identity is neutral on both sides. */
  void *identity = flight_create_color_scale_bias();
  flight_concat_color_scale_bias(out, identity, s);
  check(flight_equals_color_scale_bias(out, s), "identity then s");
  flight_concat_color_scale_bias(out, s, identity);
  check(flight_equals_color_scale_bias(out, s), "s then identity");

  flight_free_color_scale_bias(identity);
  flight_free_color_scale_bias(out);
  flight_free_color_scale_bias(s);
  flight_free_color_scale_bias(o);
}

static void inversion(void) {
  void *source = make(2, 0.5f, 4, 0.25f, 0.5f, -1, 0, 2);
  void *out = flight_create_color_scale_bias();
  flight_invert_color_scale_bias(out, source);
  check(equals(out, 0.5f, 2, 0.25f, 4, -0.5f, 1, 0, -2), "invert");

  /* A zero scale is singular: its inverse scale is pinned to one, never infinity. */
  void *singular = make(0, 0, 2, 0, 1, 0, 0, 0);
  flight_invert_color_scale_bias(out, singular);
  check(equals(out, 1, 1, 0.5f, 1, -1, 0, 0, 0), "invert singular scales");

  /* Inverting twice restores every non-singular value. */
  void *twice = flight_create_color_scale_bias();
  flight_invert_color_scale_bias(out, source);
  flight_invert_color_scale_bias(twice, out);
  check(flight_equals_color_scale_bias(twice, source), "double inversion");

  flight_free_color_scale_bias(twice);
  flight_free_color_scale_bias(singular);
  flight_free_color_scale_bias(out);
  flight_free_color_scale_bias(source);
}

static void aliasing(void) {
  /* out is also an input: the input's value is read as it was when the call began. */
  void *s = make(2, 0.5f, 4, 1, 0.25f, 0, -1, 0.5f);
  void *o = make(0.5f, 2, 0.25f, 0.5f, 1, 2, 0.5f, -0.5f);
  flight_concat_color_scale_bias(s, s, o);
  check(equals(s, 1, 1, 1, 0.5f, 2.25f, 1, 1, 0), "concat with out as source");

  void *s2 = make(2, 0.5f, 4, 1, 0.25f, 0, -1, 0.5f);
  flight_concat_color_scale_bias(o, s2, o);
  check(equals(o, 1, 1, 1, 0.5f, 2.25f, 1, 1, 0), "concat with out as other");

  void *square = make(2, 0.5f, 4, 1, 0.25f, 0, -1, 0.5f);
  flight_concat_color_scale_bias(square, square, square);
  check(equals(square, 4, 0.25f, 16, 1, 0.75f, 0, -5, 1), "concat with out as both inputs");

  void *inverted = make(2, 0.5f, 4, 0.25f, 0.5f, -1, 0, 2);
  flight_invert_color_scale_bias(inverted, inverted);
  check(equals(inverted, 0.5f, 2, 0.25f, 4, -0.5f, 1, 0, -2), "invert in place");

  flight_copy_color_scale_bias(inverted, inverted);
  check(equals(inverted, 0.5f, 2, 0.25f, 4, -0.5f, 1, 0, -2), "copy onto itself");

  flight_free_color_scale_bias(inverted);
  flight_free_color_scale_bias(square);
  flight_free_color_scale_bias(s2);
  flight_free_color_scale_bias(o);
  flight_free_color_scale_bias(s);
}

static void null_refusal(void) {
  void *value = make(2, 2, 2, 2, 1, 1, 1, 1);
  flight_concat_color_scale_bias(NULL, value, value);
  flight_concat_color_scale_bias(value, NULL, value);
  flight_concat_color_scale_bias(value, value, NULL);
  flight_invert_color_scale_bias(value, NULL);
  flight_invert_color_scale_bias(NULL, value);
  flight_copy_color_scale_bias(value, NULL);
  flight_copy_color_scale_bias(NULL, value);
  check(equals(value, 2, 2, 2, 2, 1, 1, 1, 1), "refused calls write nothing");
  flight_free_color_scale_bias(value);
}

int main(void) {
  lifecycle();
  setters();
  composition();
  inversion();
  aliasing();
  null_refusal();
  if (failures != 0) {
    return 1;
  }
  printf("flight-ffi color scale bias: ok\n");
  return 0;
}
