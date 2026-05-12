precision highp float;
precision highp sampler2D;

uniform sampler2D fftResult;
uniform float N;

in vec2 vUV;

void main() {
    vec2 uv = gl_FragCoord.xy / N;  // keep using gl_FragCoord — it works
    
    float ix = gl_FragCoord.x;
    float iy = gl_FragCoord.y;

    vec4 s = texture(fftResult, uv);
    float sgn = mod(ix + iy, 2.0) == 0.0 ? 1.0 : -1.0;
    // float height = (sgn * s.r) / (N * N);
    // float dx     = (sgn * s.b) / (N * N);  // Dx is in blue channel from timeEvolution out0
    // float dz     = (sgn * s.r) / (N * N);  

    // gl_FragColor = vec4(
    //     height,
    //     dx,
    //     dz,
    //     1.0
    // );
    gl_FragColor = (sgn / (N * N)) * s;

}