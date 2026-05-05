precision highp float;
precision highp sampler2D;


uniform sampler2D butterflyTexture;
uniform sampler2D pingPong0;
uniform sampler2D pingPong1;
uniform int pingPong;
uniform int direction;
uniform float stage;
uniform float N;

in vec2 vUV;

vec2 complexMul(vec2 a, vec2 b) {
    return vec2(a.x*b.x - a.y*b.y, a.x*b.y + a.y*b.x);
}

void main() {
    float log2N = log2(N);
    
    // 1. Precise LUT coordinates
    float pCoord = (direction == 0) ? vUV.x : vUV.y;
    float pixelCenter = (floor(pCoord * N) + 0.5) / N;
    vec2 lutUV = vec2((stage + 0.5) / log2N, pixelCenter);

    vec4 lut = texture(butterflyTexture, lutUV);
    vec2 twiddle    = lut.rg;
    float topIdx    = lut.b;
    float bottomIdx = lut.a;

    // 2. Precise Source sampling coordinates (+0.5)
    vec2 uvTop, uvBottom;
if (direction == 0) {
    // Horizontal Pass: topIdx/bottomIdx are X coordinates
    uvTop    = vec2((topIdx + 0.5) / N, vUV.y);
    uvBottom = vec2((bottomIdx + 0.5) / N, vUV.y);
} else {
    // Vertical Pass: topIdx/bottomIdx are Y coordinates
    // LEAVE vUV.x ALONE. Only offset the axis you are transforming.
    uvTop    = vec2(vUV.x, (topIdx + 0.5) / N);
    uvBottom = vec2(vUV.x, (bottomIdx + 0.5) / N);
}

    vec4 top = texture(pingPong0, uvTop);
    vec4 bottom = texture(pingPong0, uvBottom);

    // If step 2 (sign flip) is done in TS, this math stays the same
    // vec2 H = top.rg + complexMul(twiddle, bottom.rg);
    // glFragColor = vec4(H.x, H.y, 0.0, 1.0);
    vec2 H_height = top.rg + complexMul(twiddle, bottom.rg);
    vec2 H_choppy = top.ba + complexMul(twiddle, bottom.ba);
    glFragColor = vec4(H_height, H_choppy);
    
}