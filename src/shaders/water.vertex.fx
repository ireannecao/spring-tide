precision highp float;

attribute vec3 position;
attribute vec2 uv;

uniform mat4 worldViewProjection;
uniform float time;

uniform sampler2D displacementMap;
uniform sampler2D waveTexture;
const int MAX_WAVES = 32;

uniform float waveSpeed;
uniform float waveFrequency;
uniform float waveAmplitude;
uniform float decayRate;
uniform float maxAge;

const float TWO_PI = 6.28318530718;

// BUG 3 FIX: use texture() not texture2D() in WebGL2/GLSL300
float getWaveTime(float i) {
    return texture(waveTexture, vec2((i + 0.5) / float(MAX_WAVES), 0.5)).a;
}

vec3 getWavePos(float i) {
    return texture(waveTexture, vec2((i + 0.5) / float(MAX_WAVES), 0.5)).rgb;
}

varying float vHeight;

void main() {
    vec3 p = position;

    // BUG 3 FIX: texture() + scale for debug visibility
    float fftDisplacement = texture(displacementMap, uv).r * 50.0;
    p.y = fftDisplacement;

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

    gl_Position = worldViewProjection * vec4(p, 1.0);
}