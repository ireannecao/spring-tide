precision highp float;

varying float vHeight;

void main() {
  vec3 deep = vec3(0.0, 0.2, 0.5);
  vec3 shallow = vec3(0.2, 0.5, 0.8);


  float t = vHeight * 2.0 + 0.5;

  gl_FragColor = vec4(mix(deep, shallow, t), 1.0);
}