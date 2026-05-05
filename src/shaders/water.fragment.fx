precision highp float;

uniform vec3 vEyePosition;      // camera position
uniform sampler2D displacementMap;
uniform float displacementScale;
uniform float skyBrightness;
uniform vec3 dynamicSkyColor;

// fresner affect for interactive waves too
uniform sampler2D waveTexture;
uniform float time;
uniform float waveSpeed;
uniform float waveFrequency;
uniform float waveAmplitude;
uniform float decayRate;
uniform float maxAge;
uniform float maxWaves;

varying float vHeight;
varying vec3 vWorldPos;
varying vec2 vUV;

float getRippleHeight(vec2 uv) {
    float totalHeight = 0.0;
    for (int i = 0; i < 32; i++) {
        vec4 data = texture2D(waveTexture, vec2(float(i) / 32.0, 0.5));
        float spawnTime = data.w;
        if (spawnTime < 0.0) continue;

        float age = time - spawnTime;
        if (age > maxAge) continue;

        vec2 center = data.xz;
        float dist = distance(vWorldPos.xz, center);
        
        // circular wave formula
        float wave = sin(dist * waveFrequency - age * waveSpeed);
        float decay = exp(-age * decayRate) * max(0.0, 1.0 - (dist / 50.0));
        totalHeight += wave * waveAmplitude * decay;
    }
    return totalHeight;
}

void main() {
  // find slope from neighbors
  float texelSize = 1.0 / 64.0;
  float hL = texture2D(displacementMap, vUV + vec2(-texelSize, 0.0)).r;
  float hR = texture2D(displacementMap, vUV + vec2(texelSize, 0.0)).r;
  float hD = texture2D(displacementMap, vUV + vec2(0.0, -texelSize)).r;
  float hU = texture2D(displacementMap, vUV + vec2(0.0, texelSize)).r;

  float rL = getRippleHeight(vUV + vec2(-texelSize, 0.0));
  float rR = getRippleHeight(vUV + vec2(texelSize, 0.0));
  float rD = getRippleHeight(vUV + vec2(0.0, -texelSize));
  float rU = getRippleHeight(vUV + vec2(0.0, texelSize));

  // cross product of the slopes
  float dX = ((hL - hR) * displacementScale) + (rL - rR);
  float dZ = ((hD - hU) * displacementScale) + (rD - rU);
  vec3 normal = normalize(vec3(dX, 2.0, dZ));

  // FRESNEL
  vec3 viewDir = normalize(vEyePosition - vWorldPos);
  
  // Schlick's approximation
  float R0 = 0.02;
  float fresnel = R0 + (1.0 - R0) * pow(1.0 - max(dot(normal, viewDir), 0.0), 5.0);
  
  vec3 deep = vec3(0.0, 0.2, 0.5);
  vec3 shallow = vec3(0.2, 0.5, 0.8);
  vec3 skyColor = dynamicSkyColor;

  // vec3 skyColor = vec3(0.7, 0.85, 1.0) * skyBrightness; // day -> night interaction

  vec3 waterBase = mix(deep, shallow, vHeight * 0.5 + 0.5);
  vec3 finalColor = mix(waterBase, dynamicSkyColor, fresnel);

  gl_FragColor = vec4(finalColor, 1.0);
}