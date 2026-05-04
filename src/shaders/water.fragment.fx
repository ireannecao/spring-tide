precision highp float;

uniform vec3 vEyePosition;      // camera position
uniform sampler2D displacementMap;
uniform float displacementScale;

varying float vHeight;
varying vec3 vWorldPos;
varying vec2 vUV;

void main() {
  // find slope from neighbors
  float texelSize = 1.0 / 64.0;
  float hL = texture2D(displacementMap, vUV + vec2(-texelSize, 0.0)).r;
  float hR = texture2D(displacementMap, vUV + vec2(texelSize, 0.0)).r;
  float hD = texture2D(displacementMap, vUV + vec2(0.0, -texelSize)).r;
  float hU = texture2D(displacementMap, vUV + vec2(0.0, texelSize)).r;

  // cross product of the slopes
  vec3 normal = normalize(vec3((hL - hR) * displacementScale, 2.0, (hD - hU) * displacementScale));

  // FRESNEL
  vec3 viewDir = normalize(vEyePosition - vWorldPos);
  
  // Schlick's approximation
  float R0 = 0.02;
  float fresnel = R0 + (1.0 - R0) * pow(1.0 - max(dot(normal, viewDir), 0.0), 5.0);
  
  vec3 deep = vec3(0.0, 0.2, 0.5);
  vec3 shallow = vec3(0.2, 0.5, 0.8);
  vec3 skyColor = vec3(0.7, 0.85, 1.0) * .8; // scaling last part can be dail for day -> night interaction

  vec3 waterBase = mix(deep, shallow, vHeight * 0.5 + 0.5);
  vec3 finalColor = mix(waterBase, skyColor, fresnel);

  gl_FragColor = vec4(finalColor, 1.0);
}