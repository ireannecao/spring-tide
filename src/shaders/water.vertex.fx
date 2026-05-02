precision highp float;

attribute vec3 position;
uniform mat4 worldViewProjection;
uniform float time;

varying float vHeight;

void main() {
  vec3 p = position;

  float wave =
      sin(p.x * 0.2 + time) * 0.5 +
      sin(p.z * 0.3 + time * 1.2) * 0.3;

  p.y = wave;
  vHeight = wave;

  gl_Position = worldViewProjection * vec4(p, 1.0);
}