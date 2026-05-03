#version 300 es
precision highp float;

uniform sampler2D fftResult;
uniform float N;

in vec2 vUV;
out vec4 outColor;

void main() {
    float ix = floor((vUV.x + 0.5 / N) * N);
    float iy = floor((vUV.y + 0.5 / N) * N);
    
    vec4 s = texture(fftResult, vUV);
    float sign = mod(ix + iy, 2.0) == 0.0 ? 1.0 : -1.0;

    // Normalizing by N*N is mathematically required for IFFT
    float height = (sign * s.r) / (N * N); 
    
    outColor = vec4(height, height, height, 1.0);
}