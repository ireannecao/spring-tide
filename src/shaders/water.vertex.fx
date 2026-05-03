precision highp float;

attribute vec3 position;
attribute vec3 uv;
uniform mat4 worldViewProjection;

uniform float maxAge;
uniform float speed;
uniform float padding;
uniform sampler2D waveTexture;
uniform sampler2D displacementMap;
uniform float time;
// uniform float maxWaves;
const int MAX_WAVES = 32;

float getWaveTime(float i) {
    return texture2D(waveTexture, vec2((i + 0.5) / float(MAX_WAVES), 0.5)).a;
}

vec3 getWavePos(float i) {
    return texture2D(waveTexture, vec2((i + 0.5) / float(MAX_WAVES), 0.5)).rgb;
}

varying float vHeight;

void main() {
  vec3 p = position;

  // float wave =
  //     sin(p.x * 0.2 + time) * 0.5 +
  //     sin(p.z * 0.3 + time * 1.2) * 0.3;
  float wave = texture2D(displacementMap, uv.xy).r;

  p.y = wave;
    
  float ripple = 0.0;

  for (int i = 0; i < MAX_WAVES; i++) {
    float t = getWaveTime(float(i));
    if (t < 0.0) continue;

    float age = time - t;
    if (age <= 0.0 || age > maxAge) continue;

    vec3 pos = getWavePos(float(i));

    float dist = distance(p.xz, pos.xz);
    float maxRadius = maxAge * speed + padding;

    if (dist > maxRadius) continue;

    float waveFront = age * speed;
    float thickness = 5.0;

    float mask = smoothstep(waveFront - thickness, waveFront, dist) * 
                  (1.0 - smoothstep(waveFront, waveFront + 0.2, dist));
    
    float amplitude = 1.5 * exp(-age * 1.5);
    ripple += sin((dist - waveFront) * 2.0) * amplitude * mask;
  }

  p.y += ripple;
  vHeight = p.y;

  gl_Position = worldViewProjection * vec4(p, 1.0);
}