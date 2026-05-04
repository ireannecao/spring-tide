precision highp float;
precision highp sampler2D;

uniform sampler2D h0Texture;
uniform float time;
uniform float N;
uniform float L;

in vec2 vUV;

const float g = 9.81;
const float TWO_PI = 6.28318530718;

vec2 complexMul(vec2 a, vec2 b) {
    return vec2(a.x * b.x - a.y * b.y, a.x * b.y + a.y * b.x);
}

void main() {
    float n = floor(vUV.y * N) - N * 0.5;
    float m = floor(vUV.x * N) - N * 0.5;

    float kx = (TWO_PI / L) * m;
    float kz = (TWO_PI / L) * n;
    float kLen = length(vec2(kx, kz));

    float omega = sqrt(g * max(kLen, 0.0001));
    float cosT = cos(omega * time);
    float sinT = sin(omega * time);

    vec2 euler_pos = vec2(cosT,  sinT);
    vec2 euler_neg = vec2(cosT, -sinT);

    vec4 h0 = texture(h0Texture, vUV);
    vec2 h = complexMul(h0.rg, euler_pos) + complexMul(h0.ba, euler_neg);

    // Final output assignment
    // glFragColor = vec4(h.x, h.y, 0.0, 1.0);
    // glFragColor = vec4(vUV, 0.0, 1.0);
    glFragColor = vec4(h.x, h.y, 0.0, 1.0);
}