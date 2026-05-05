precision highp float;

attribute vec3 position;
attribute vec2 uv;

uniform mat4 worldViewProjection;
uniform mat4 world;
uniform float time;

uniform sampler2D displacementMap;
uniform sampler2D waveTexture;
const int MAX_WAVES = 32;

uniform float waveSpeed;
uniform float waveFrequency;
uniform float waveAmplitude;
uniform float decayRate;
uniform float maxAge;
uniform float displacementScale;  

const float TWO_PI = 6.28318530718;

float getWaveTime(float i) {
    return texture(waveTexture, vec2((i + 0.5) / float(MAX_WAVES), 0.5)).a;
}

vec3 getWavePos(float i) {
    return texture(waveTexture, vec2((i + 0.5) / float(MAX_WAVES), 0.5)).rgb;
}

varying float vHeight;
varying vec3 vWorldPos;
varying vec2 vUV;

void main() {
    vec3 p = position;

    // float fftDisplacement = textureLod(displacementMap, uv, 0.0).r;
    // p.y = fftDisplacement * displacementScale;

    vec4 displacements = textureLod(displacementMap, uv, 0.0);
    float dy = displacements.r * displacementScale;
    float dxz = displacements.g * displacementScale * 1.0; // 1.0 choppiness

    p.y = dy;
    p.x += dxz; 
    p.z += dxz;

    float ripple = 0.0;
    for (int i = 0; i < MAX_WAVES; i++) {
        float t = getWaveTime(float(i));
        if (t < 0.0) continue;

        float age = time - t;
        if (age <= 0.0 || age > maxAge) continue;

        vec3 wavePos = getWavePos(float(i));
        float dist = distance(p.xz, wavePos.xz);

        float maxRadius = maxAge * waveSpeed;
        if (dist > maxRadius) continue;

        float waveFront = age * waveSpeed;
        float ringWidth = waveSpeed * 2.0;
        float envelope  = waveAmplitude * exp(-age * decayRate);

        float mask = smoothstep(waveFront - ringWidth, waveFront, dist)
                   * (1.0 - smoothstep(waveFront, waveFront + ringWidth * 0.1, dist));

        ripple += sin((dist - waveFront) * waveFrequency * TWO_PI) * envelope * mask;
    }

    p.y += ripple;
    vHeight = p.y;
    vUV = uv;

    vWorldPos = (world * vec4(p, 1.0)).xyz; // local position

    gl_Position = worldViewProjection * vec4(p, 1.0);
}
