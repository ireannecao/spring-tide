precision highp float;

uniform sampler2D prevFoam;
uniform sampler2D displacementYDx;
uniform sampler2D displacementDz;
uniform float fadeRate;
uniform float foamChoppiness;
uniform float N;

in vec2 vUV;

void main() {
    float texelSize = 1.0 / N;

    float dxL = texture2D(displacementYDx, vUV + vec2(-texelSize, 0.0)).b;
    float dxR = texture2D(displacementYDx, vUV + vec2( texelSize, 0.0)).b;
    float dzD = texture2D(displacementDz,  vUV + vec2(0.0, -texelSize)).r;
    float dzU = texture2D(displacementDz,  vUV + vec2(0.0,  texelSize)).r;

    float Jxx = 1.0 + foamChoppiness * (dxR - dxL) / (2.0 * texelSize);
    float Jzz = 1.0 + foamChoppiness * (dzU - dzD) / (2.0 * texelSize);
    float jacobian = Jxx * Jzz;

    // negative jacobian = folding = generate foam
    float newFoam = clamp((-jacobian + 1.2) * 6.0, 0.0, 1.0);

    // read previous foam and fade it
    float prevF = texture2D(prevFoam, vUV).r;
    float accumulated = max(newFoam, prevF * fadeRate);

    gl_FragColor = vec4(accumulated, accumulated, accumulated, 1.0);
}