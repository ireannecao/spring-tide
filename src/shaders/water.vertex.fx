precision highp float;

attribute vec3 position;
attribute vec2 uv;

uniform mat4 worldViewProjection;
uniform mat4 world;
uniform float time;

uniform sampler2D displacementYDx;
uniform sampler2D displacementDz;
uniform sampler2D waveTexture;
const int MAX_WAVES = 32;

uniform float waveSpeed;
uniform float waveFrequency;
uniform float waveAmplitude;
uniform float decayRate;
uniform float maxAge;
uniform float displacementScale;  
uniform float choppiness;

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
    vec3 base = position;
    vec3 p = position;

    // float fftDisplacement = textureLod(displacementMap, uv, 0.0).r;
    // p.y = fftDisplacement * displacementScale;

    // vec4 displacements = textureLod(displacementMap, uv, 0.0);
    // out0: RG = Dy (height), BA = Dx (choppiness X)
    vec4 ydx = textureLod(displacementYDx, uv, 0.0);
    // out1: RG = Dz (choppiness Z)
    vec4 dz_sample = textureLod(displacementDz, uv, 0.0);
    float dy = ydx.r * displacementScale;
    float dx = ydx.b * choppiness;  // BA channel = Dx real part
    float dz = dz_sample.r * choppiness; // RG channel = Dz real part

    p.x += dx;
    p.z += dz;

    p.y = dy;

    float ripple = 0.0;
    for (int i = 0; i < MAX_WAVES; i++) {
        // float t = getWaveTime(float(i));
        vec4 data = texture(waveTexture, vec2((float(i) + 0.5) / float(MAX_WAVES), 0.5));
        float t = data.a;
        if (t < 0.0) continue;

        float age = time - t;
        if (age <= 0.0 || age > maxAge) continue;

        vec3 wavePos = getWavePos(float(i));
        float dist = distance(base.xz, wavePos.xz);

        float maxRadius = maxAge * waveSpeed;
        if (dist > maxRadius) continue;

        float individualAmp = data.y;

        float waveFront = age * waveSpeed;
        float ringWidth = waveSpeed * 2.0;
        float envelope  = individualAmp * exp(-age * decayRate);

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
