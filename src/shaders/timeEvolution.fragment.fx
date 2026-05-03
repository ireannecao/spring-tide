precision highp float;

uniform sampler2D h0Texture;
uniform float time;
uniform float N;
uniform float L;

varying vec2 vUV;

const float g = 9.81;
const float TWO_PI = 6.28318530718;

vec2 complexMul(vec2 a, vec2 b) {
    return vec2(a.x * b.x - a.y * b.y, a.x * b.y + a.y * b.x);
}

void main() {
    vec2 uv = vUV;

    // Shift from [0, N) to [-N/2, N/2) so DC is at center
    float n = floor(uv.x * N) - N * 0.5;
    float m = floor(uv.y * N) - N * 0.5;

    float kx = (TWO_PI / L) * n;
    float kz = (TWO_PI / L) * m;
    float kLen = length(vec2(kx, kz));

    // Dispersion: ω(k) = sqrt(g|k|)
    float omega = sqrt(g * max(kLen, 0.0001));

    float cosT = cos(omega * time);
    float sinT = sin(omega * time);

    vec2 euler_pos = vec2(cosT,  sinT);   // e^(iωt)
    vec2 euler_neg = vec2(cosT, -sinT);   // e^(-iωt)

    // h0.rg = h₀(k),  h0.ba = h₀(-k)* (conjugate already baked in on CPU)
    vec4 h0 = texture2D(h0Texture, uv);
    vec2 h0k  = h0.rg;
    vec2 h0mk = h0.ba;

    // h(k,t) = h₀(k)·e^(iωt) + h₀(-k)*·e^(-iωt)
    vec2 h = complexMul(h0k, euler_pos) + complexMul(h0mk, euler_neg);

    gl_FragColor = vec4(h.x, h.y, 0.0, 1.0);
}