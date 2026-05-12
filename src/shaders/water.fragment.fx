precision highp float;

uniform float N;

uniform vec3 vEyePosition;      // camera position
uniform sampler2D displacementYDx;
uniform sampler2D displacementDz;
uniform float displacementScale;
uniform float skyBrightness;
uniform vec3 dynamicSkyColor;

uniform vec3 sunDirection;
uniform vec3 sunColor;

// fresner affect for interactive waves too
uniform sampler2D waveTexture;
uniform float time;
uniform float waveSpeed;
uniform float waveFrequency;
uniform float waveAmplitude;
uniform float decayRate;
uniform float maxAge;
uniform float maxWaves;
uniform float waterDepth;      // how deep the water is (world units)
uniform vec3 shallowColor;     // e.g. vec3(0.1, 0.6, 0.5) — teal
uniform vec3 deepColor;        // e.g. vec3(0.0, 0.1, 0.3) — dark blue
uniform float depthFalloff;    // how quickly it goes opaque, e.g. 0.1
uniform float lightIntensity;
uniform float sssStrength;

uniform sampler2D foamAccumTexture;
uniform sampler2D foamTexture;  // visual foam texture

varying float vHeight;
varying vec3 vWorldPos;
varying vec2 vUV;

float getRippleHeight(vec2 uv) {
    float totalHeight = 0.0;
    for (int i = 0; i < 32; i++) {
        vec4 data = texture2D(waveTexture, vec2((float(i) + 0.5) / 32.0, 0.5));
        float spawnTime = data.w;
        if (spawnTime < 0.0) continue;

        float age = time - spawnTime;
        if (age > maxAge) continue;

        float individualAmp = data.g;

        vec2 center = data.xz;
        float dist = distance(vWorldPos.xz, center);
        
        // circular wave formula
        float wave = sin(dist * waveFrequency - age * waveSpeed);
        float decay = exp(-age * decayRate) * max(0.0, 1.0 - (dist / 50.0));
        totalHeight += wave * individualAmp * decay;
    }
    return totalHeight;
}

void main() {
  // find slope from neighbors
  float texelSize = 1.0 / N;
    // Use R channel (Dy) for normal estimation from displacementYDx
    float hL = texture2D(displacementYDx, vUV + vec2(-texelSize, 0.0)).r;
    float hR = texture2D(displacementYDx, vUV + vec2( texelSize, 0.0)).r;
    float hD = texture2D(displacementYDx, vUV + vec2(0.0, -texelSize)).r;
    float hU = texture2D(displacementYDx, vUV + vec2(0.0,  texelSize)).r;

//   float hL = texture2D(displacementMap, vUV + vec2(-texelSize, 0.0)).r;
//   float hR = texture2D(displacementMap, vUV + vec2(texelSize, 0.0)).r;
//   float hD = texture2D(displacementMap, vUV + vec2(0.0, -texelSize)).r;
//   float hU = texture2D(displacementMap, vUV + vec2(0.0, texelSize)).r;

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
  fresnel *= 0.6;

  // Depth-based water color
  float normalizedHeight = vHeight * 0.5 + 0.5; // 0=trough, 1=crest
float effectiveDepth = waterDepth * (1.0 - normalizedHeight * 0.5);
float depthFactor = 1.0 - (normalizedHeight * 0.5 + 0.5); // 1 at trough, 0 at crest
float depthAlpha = 1.0 - exp(-effectiveDepth * depthFalloff);

    vec3 litShallow = shallowColor * lightIntensity;
    vec3 litDeep    = deepColor    * lightIntensity;
    vec3 refractedColor = mix(litShallow, litDeep, depthFactor);

// specular
    vec3 lightDir = normalize(-sunDirection);
    // sun is low = grazing angle = long specular streak
float horizonFactor = abs(sunDirection.z);  // 0 at noon, 1 at horizon
float specPower = mix(512.0, 64.0, horizonFactor);  // sharp at noon, broad at sunset
float specIntensity = mix(0.6, 2.0, horizonFactor); // dim at noon, bright streak at sunset
// float sunAboveHorizon = smoothstep(0.0, 0.05, -sunDirection.y + 0.05); 
float sunHorizonOffset = -10.0 / 60.0;
float sunVisibility = smoothstep(-sunHorizonOffset, -sunHorizonOffset - 0.04, sunDirection.y);
vec3 halfVec = normalize(lightDir + viewDir);
float spec = pow(max(dot(normal, halfVec), 0.0), specPower);
float slopeMask = smoothstep(0.1, 0.4, length(vec2(dX, dZ)));
vec3 specular = sunColor * spec * specIntensity * slopeMask * sunVisibility;

// vec3 specular = vec3(1.0) * spec * 1.5;  // bright white
  
    // vec3 skyColor = dynamicSkyColor;

  // vec3 skyColor = vec3(0.7, 0.85, 1.0) * skyBrightness; // day -> night interaction

  // Subsurface scattering
// vec3 lightDir = normalize(vec3(0.5, 1.0, 0.3));  // same as your specular lightDir

// how much the wave crest is facing away from light (backlit)
float sssBase = max(0.0, dot(-normal, lightDir));

// stronger at crests and steep slopes
float sssMask = smoothstep(0.3, 1.0, normalizedHeight) * 
                smoothstep(0.0, 0.3, length(vec2(dX, dZ)));

// thin wave tips let more light through
float thickness = 1.0 - smoothstep(0.5, 1.0, normalizedHeight);

float sss = sssBase * sssMask * (1.0 - thickness * 0.5) * sunVisibility;

// SSS color — warm turquoise, brighter than water body
vec3 scatterColor = vec3(0.0, 0.5, 0.4);
vec3 sssColor = sunColor * scatterColor * lightIntensity * 2.0;
vec3 finalColor = mix(refractedColor, dynamicSkyColor, fresnel) + specular + sss * sssColor * sssStrength;

    // vec3 finalColor = mix(refractedColor, dynamicSkyColor, fresnel) + specular;
    float alpha = mix(depthAlpha * 0.85, 1.0, fresnel);
//   vec3 waterBase = mix(deep, shallow, vHeight * 0.5 + 0.5);
//   vec3 finalColor = mix(waterBase, dynamicSkyColor, fresnel);

// Whitecaps on steep crests
// Jacobian-based foam — appears where horizontal displacement is strongest
// float dxL = texture2D(displacementYDx, vUV + vec2(-texelSize, 0.0)).b;
// float dxR = texture2D(displacementYDx, vUV + vec2( texelSize, 0.0)).b;
// float dzD = texture2D(displacementDz,  vUV + vec2(0.0, -texelSize)).r;
// float dzU = texture2D(displacementDz,  vUV + vec2(0.0,  texelSize)).r;

// float foamChoppiness = 8.0;

// // jacobian determinant — negative where wave folds
// float Jxx = 1.0 + foamChoppiness * (dxR - dxL) / (2.0 * texelSize);
// float Jzz = 1.0 + foamChoppiness * (dzU - dzD) / (2.0 * texelSize);
// float jacobian = Jxx * Jzz;

// // foam where jacobian is small (near folding)
// float foam = 1.0 - smoothstep(2.0, 5.0, jacobian);
// // float foam = smoothstep(0.0, 1.0, 1.0 - clamp(jacobian / 10.0, 0.0, 1.0));
// foam *= smoothstep(0.3, 1.0, normalizedHeight);  // only on upper half of waves
// foam = clamp(foam, 0.0, 1.0);

// // float crestFoam = smoothstep(0.65, 0.85, normalizedHeight) * 
// //                   smoothstep(0.1, 0.4, length(vec2(dX, dZ)));
// // float crestFoam = smoothstep(0.3, 0.6, normalizedHeight) * 
// //                   smoothstep(0.0, 0.3, length(vec2(dX, dZ)));  // only on steep slopes
// vec3 foamColor = vec3(0.9, 0.95, 1.0);

// sample accumulated turbulence
// float turbulence = texture2D(foamAccumTexture, vUV).r;

// // scale and bias like the reference — tune foamBias and foamScale
// float foamBias = 0.3;
// float foamScale = 2.0;
// float foamAmount = clamp((-turbulence + foamBias) * foamScale, 0.0, 1.0);

// // only on upper crests
// foamAmount *= smoothstep(0.2, 0.55, normalizedHeight);

// // sample foam texture for detail
// vec3 foamDetail = texture2D(foamTexture, vUV * 6.0).rgb;
// vec3 foamColor = vec3(0.9, 0.95, 1.0) * foamDetail;

// finalColor = mix(finalColor, foamColor, foamAmount);


// finalColor = mix(finalColor, foamColor, foam * 0.7);


  gl_FragColor = vec4(finalColor, alpha);
}