import { Engine } from "@babylonjs/core/Engines/engine";
import { WebGPUEngine } from "@babylonjs/core/Engines/webgpuEngine";
import { Scene } from "@babylonjs/core/scene";
import { ArcRotateCamera } from "@babylonjs/core/Cameras/arcRotateCamera";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { HemisphericLight } from "@babylonjs/core/Lights/hemisphericLight";
import { DirectionalLight, GlowLayer } from "@babylonjs/core";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import { ShaderMaterial } from "@babylonjs/core/Materials/shaderMaterial";
import { RawTexture } from "@babylonjs/core/Materials/Textures/rawTexture";
import { Texture } from "@babylonjs/core/Materials/Textures/texture";
import { Constants } from "@babylonjs/core/Engines/constants";
import waterVertex from "./shaders/water.vertex.fx";
import waterFragment from "./shaders/water.fragment.fx";
import { Effect } from "@babylonjs/core/Materials/effect";
import { SpriteManager } from "@babylonjs/core/Sprites/spriteManager";
import { Sprite } from "@babylonjs/core/Sprites/sprite";
import { generatePhillipsSpectrum } from "./ocean/PhillipsSpectrum";
import { OceanFFT } from "./ocean/OceanFFT";
import { ButterflyPass } from "./ocean/ButterflyPass";
import { FoamPass } from "./ocean/FoamPass";
import "@babylonjs/core/Materials/standardMaterial";
import "@babylonjs/core/Culling/ray";
import { Color3, Color4, Material, StandardMaterial, Tools } from "@babylonjs/core";
import * as GUI from "@babylonjs/gui/2D";

// ─── Single source of truth ───────────────────────────────────────────────────
import { OceanConfig } from "./config";
const { fft: fftCfg, ripple: rippleCfg, visuals: vis } = OceanConfig;
// ─────────────────────────────────────────────────────────────────────────────

(window as any).Effect_Index = Effect;

const canvas = document.getElementById("renderCanvas") as HTMLCanvasElement;
const engine = new Engine(canvas, true);
const scene = new Scene(engine);

const camera = new ArcRotateCamera("cam", Math.PI / 2, Math.PI / 3, 30, Vector3.Zero(), scene);
// camera.attachControl(canvas, true);
camera.setPosition(new Vector3(0, 1, -50));
const hemiLight = new HemisphericLight("light", new Vector3(0, 1, 0), scene);

const sunLight = new DirectionalLight(
    "sunLight",
    new Vector3(0, -1, 0),
    scene
);

// sunLight.position = new Vector3(0, 40, -120);
sunLight.intensity = 2.5;
sunLight.diffuse = new Color3(1.0, 0.95, 0.8);
sunLight.specular = new Color3(1.0, 0.95, 0.85);

const sun = MeshBuilder.CreateSphere(
    "sun",
    { diameter: 12 },
    scene
);
// sun.position = new Vector3(0, 35, 140);

const sunMat = new StandardMaterial("sunMat", scene);
sunMat.emissiveColor = new Color3(1.0, 0.9, 0.6);
sunMat.disableLighting = true;
sun.material = sunMat;
sunMat.alphaMode = Constants.ALPHA_COMBINE;
sunMat.transparencyMode = Material.MATERIAL_ALPHABLEND;

const glowLayer = new GlowLayer("glow", scene);
glowLayer.intensity = 0.8;
glowLayer.addIncludedOnlyMesh(sun);
glowLayer.renderingGroupId = 0;

// -----------------------------
// Geometry — L drives mesh size
// -----------------------------
const water = MeshBuilder.CreateGround(
    "water",
    {
        width: fftCfg.L,
        height: fftCfg.L,
        subdivisions: fftCfg.N,
    },
    scene
);
water.alwaysSelectAsActiveMesh = true;
water.renderingGroupId = 1;

// -----------------------------
// Register shaders
// -----------------------------
Effect.ShadersStore["waterVertexShader"] = waterVertex;
Effect.ShadersStore["waterFragmentShader"] = waterFragment;

// -----------------------------
// Shader material
// -----------------------------
const waterShader = new ShaderMaterial(
    "waterShader",
    scene,
    { vertex: "water", fragment: "water" },
    {
        attributes: ["position", "uv"],
        uniforms: [
            "world",
            "worldViewProjection",
            "vEyePosition",
            "time",
            "waveSpeed",
            "waveFrequency",
            "waveAmplitude",
            "decayRate",
            "maxAge",
            "maxWaves",
            "displacementScale",
            "choppiness",
            "skyBrightness",
            "dynamicSkyColor",
            "waterDepth",
            "depthFalloff",
            "shallowColor",
            "deepColor",
            "lightIntensity",
            "N",
            "sunDirection",
            "sunColor",
            "sssStrength",
        ],
        samplers: ["waveTexture", "displacementYDx", "displacementDz", "foamTexture", "foamAccumTexture"],
    }
);
waterShader.alphaMode = Constants.ALPHA_COMBINE;
waterShader.transparencyMode = Material.MATERIAL_ALPHABLEND;

water.hasVertexAlpha = false;
// waterShader.needDepthPrePass = true;
waterShader.alpha = 1.0;


// Ripple uniforms from config
waterShader.setFloat("waveSpeed", rippleCfg.speed);
waterShader.setFloat("waveFrequency", rippleCfg.frequency);
waterShader.setFloat("waveAmplitude", rippleCfg.amplitude);
waterShader.setFloat("decayRate", rippleCfg.decayRate);
waterShader.setFloat("maxAge", rippleCfg.maxAge);

waterShader.setFloat("N", fftCfg.N);
// waterShader.setFloat("choppiness", fftCfg.choppiness)

// FFT displacement scale — replaces the magic * 8.0 in the old shader
waterShader.setFloat("displacementScale", fftCfg.displacementScale);

// Transparency
waterShader.setFloat("waterDepth", 15.0);
waterShader.setFloat("depthFalloff", 0.8);
waterShader.setVector3("shallowColor", new Vector3(0.03, 0.12, 0.2)); //(0.2, 0.5, 0.8)
waterShader.setVector3("deepColor", new Vector3(0.0, 0.02, 0.05)); //(0.0, 0.2, 0.5)
// comments are from the original values in fragment shader
waterShader.setFloat("sssStrength", 5.0);

// sliders control this
waterShader.setFloat("choppiness", fftCfg.choppiness);
waterShader.setFloat("skyBrightness", OceanConfig.visuals.skyBrightness);

waterShader.setVector3(
    "sunDirection",
    sunLight.direction.normalize()
);

waterShader.setVector3(
    "sunColor",
    new Vector3(1.0, 0.95, 0.85)
);

water.material = waterShader;

const seabed = MeshBuilder.CreateGround("seabed", {
    width: fftCfg.L * 20,
    height: fftCfg.L * 20,
}, scene);
seabed.position.y = -10.0;

const seabedMat = new StandardMaterial("seabedMat", scene);
const seabedTex = new Texture("assets/ground.png", scene);  // your image path
seabedTex.uScale = 100;  // tile 10x horizontally
seabedTex.vScale = 100;  // tile 10x vertically
seabedMat.diffuseTexture = seabedTex;
seabed.material = seabedMat;

scene.fogMode = Scene.FOGMODE_EXP2;
scene.fogDensity = 0.008;
seabed.applyFog = true;
water.applyFog = false;
sun.applyFog = false;


// const seabedMat = new StandardMaterial("seabedMat", scene);
// // seabedMat.diffuseColor = new Color3(0.8, 0.7, 0.5); // sandy color
// seabedMat.diffuseColor = new Color3(0.0, 0.05, 0.1);  // near black, was sandy
// seabed.material = seabedMat;

// seabed.renderingGroupId = 0;
// water.renderingGroupId = 1;

const foamTex = new Texture("https://assets.babylonjs.com/environments/waterFoam_circular_mask.png", scene);
waterShader.setTexture("foamTexture", foamTex);

// -----------------------------
// Click-wave texture
// -----------------------------
const MAX_WAVES = 32;
const waveData = new Float32Array(MAX_WAVES * 4);
for (let i = 0; i < MAX_WAVES; i++) {
    waveData[i * 4 + 3] = -1.0; // mark slot as inactive
}
const waveTexture = new RawTexture(
    waveData,
    MAX_WAVES, 1,
    Constants.TEXTUREFORMAT_RGBA,
    scene, false, false,
    Texture.NEAREST_SAMPLINGMODE,
    Engine.TEXTURETYPE_FLOAT
);
let nextWaveIndex = 0;
waterShader.setTexture("waveTexture", waveTexture);
waterShader.setFloat("maxWaves", MAX_WAVES);

// -----------------------------
// Phillips spectrum (CPU)
// fftCfg satisfies SpectrumConfig — all fields present
// -----------------------------
const displacementData = generatePhillipsSpectrum(fftCfg);

// const nonZero = Array.from(displacementData).filter(v => Math.abs(v) > 0.001).length;
// const maxVal = Math.max(...Array.from(displacementData).map(Math.abs));
let nonZero = 0;
let maxVal = 0;
for (let i = 0; i < displacementData.length; i++) {
    const abs = Math.abs(displacementData[i]);
    if (abs > 0.001) nonZero++;
    if (abs > maxVal) maxVal = abs;
}

// console.log(`[Phillips] Non-zero: ${nonZero} / ${displacementData.length}, max: ${maxVal}`);

const h0Texture = new RawTexture(
    displacementData,
    fftCfg.N, fftCfg.N,   // was hard-coded 64, 64
    Constants.TEXTUREFORMAT_RGBA,
    scene, false, false,
    Texture.NEAREST_SAMPLINGMODE,
    Engine.TEXTURETYPE_FLOAT
);

// -----------------------------
// GPU pipeline
// -----------------------------
const oceanFFT = new OceanFFT(scene, h0Texture, fftCfg.N, fftCfg.L, /* autoRun= */ false);
const butterflyPassY = new ButterflyPass(scene, oceanFFT.spectrumMRT.textures[0], fftCfg.N, "fft_Y", /* autoRun= */ false);
const butterflyPassZ = new ButterflyPass(scene, oceanFFT.spectrumMRT.textures[1], fftCfg.N, "fft_Z", /* autoRun= */ false);

waterShader.setTexture("displacementYDx", butterflyPassY.displacementTexture);
waterShader.setTexture("displacementDz", butterflyPassZ.displacementTexture);

const foamPass = new FoamPass(
    scene,
    fftCfg.N,
    butterflyPassY.displacementTexture,
    butterflyPassZ.displacementTexture,
    false
);

waterShader.setTexture("foamAccumTexture", foamPass.foamTexture);

// -----------------------------
// Debug readback (frame 240)
// -----------------------------
const start = performance.now();
let debugFrameCount = 0;

scene.onAfterRenderObservable.add(async () => {
    debugFrameCount++;
    if (debugFrameCount % 40 !== 0) return;


    // const byPixels = await butterflyPassY.displacementTexture.readPixels();
    // const by = new Float32Array(byPixels!.buffer);
    // const dyVals = Array.from({ length: 64 * 64 }, (_, i) => by[i * 4 + 0]);
    // const dxVals = Array.from({ length: 64 * 64 }, (_, i) => by[i * 4 + 2]);
    // console.log(`[Dy] max=${Math.max(...dyVals.map(Math.abs)).toFixed(4)}, mean=${(dyVals.reduce((a, b) => a + Math.abs(b), 0) / (64 * 64)).toFixed(4)}`);
    // console.log(`[Dx] max=${Math.max(...dxVals.map(Math.abs)).toFixed(4)}, mean=${(dxVals.reduce((a, b) => a + Math.abs(b), 0) / (64 * 64)).toFixed(4)}`);

});

// scene.onAfterRenderObservable.add(async () => {
//     debugFrameCount++;
//     if (debugFrameCount !== 240) return;

//     const N = fftCfg.N; // was a separate hard-coded `const N = 64`

//     // const fftPixels = await oceanFFT.displacementTexture.readPixels(0, 0, undefined, false);
//     // const fftFloats = new Float32Array(fftPixels!.buffer);
//     // const fftR = Array.from({ length: N * N }, (_, i) => fftFloats[i * 4]);
//     // console.log(`[OceanFFT] max=${Math.max(...fftR.map(Math.abs)).toFixed(4)}, nonZero=${fftR.filter(v => Math.abs(v) > 0.0001).length}/${N * N}`);

//     // const bpPixels = await butterflyPass.displacementTexture.readPixels(0, 0, undefined, false);
//     // const bpFloats = new Float32Array(bpPixels!.buffer);
//     // const bpR = Array.from({ length: N * N }, (_, i) => bpFloats[i * 4]);

//     // const height = Array.from({ length: N * N }, (_, i) => bpFloats[i * 4 + 0]);
//     // const dx = Array.from({ length: N * N }, (_, i) => bpFloats[i * 4 + 1]);
//     // const dz = Array.from({ length: N * N }, (_, i) => bpFloats[i * 4 + 2]);

//     // console.log(
//     //     `[MRT Ocean] height max=${Math.max(...height.map(Math.abs)).toFixed(4)}, ` +
//     //     `dx max=${Math.max(...dx.map(Math.abs)).toFixed(4)}, ` +
//     //     `dz max=${Math.max(...dz.map(Math.abs)).toFixed(4)}`
//     // );
//     // console.log(`[Butterfly out] max=${Math.max(...bpR.map(Math.abs)).toFixed(4)}, nonZero=${bpR.filter(v => Math.abs(v) > 0.0001).length}/${N * N}`);
// });

console.log("WebGL version:", engine.webGLVersion);

// -----------------------------
// Render loop
// -----------------------------
let displacementBuffer: Float32Array | null = null;
let isFetching = false;

scene.onBeforeRenderObservable.add(() => {
    const time = (performance.now() - start) * 0.002;

    oceanFFT.update(time);
    oceanFFT.runPass();
    butterflyPassY.runPass();
    butterflyPassZ.runPass();
    foamPass.runPass();
    waterShader.setTexture("foamAccumTexture", foamPass.foamTexture);

    if (!isFetching) {
        isFetching = true;
        butterflyPassY.getDisplacementData().then((data) => {
            displacementBuffer = data;
            isFetching = false;
        });
    }

    waterShader.setVector3("vEyePosition", camera.position);
    waterShader.setFloat("time", time);
    waterShader.setTexture("displacementYDx", butterflyPassY.displacementTexture);
    waterShader.setTexture("displacementDz", butterflyPassZ.displacementTexture);

    if (displacementBuffer != null) {
        const N = fftCfg.N;
        const L = fftCfg.L;
        penguinManager.sprites.forEach((p) => {
            const u = (p.position.x / L) + 0.5;
            const v = (p.position.z / L) + 0.5;

            const xPixel = Math.max(0, Math.min(N - 1, Math.floor(u * N)));
            const yPixel = Math.max(0, Math.min(N - 1, Math.floor(v * N)));

            const pixelIdx = (yPixel * N + xPixel) * 4;
            // const fftHeight = displacementBuffer![pixelIdx] * fftCfg.displacementScale;
            const i = pixelIdx;

            const height = displacementBuffer![i + 0] * fftCfg.displacementScale;
            // const dx = displacementBuffer![i + 1] * fftCfg.displacementScale * fftCfg.choppiness;
            // const dz = displacementBuffer![i + 2] * fftCfg.displacementScale * fftCfg.choppiness;

            let rippleHeight = 0;
            const TWO_PI = 6.2831853;

            for (let i = 0; i < MAX_WAVES; i++) {
                const spawnTime = waveData[i * 4 + 3];
                if (spawnTime < 0.0) continue;

                const age = time - spawnTime;
                if (age <= 0.0 || age > rippleCfg.maxAge) continue;

                const dx = p.position.x - waveData[i * 4 + 0];
                const dz = p.position.z - waveData[i * 4 + 2];
                const dist = Math.sqrt(dx * dx + dz * dz);

                const waveFront = age * rippleCfg.speed;
                const ringWidth = rippleCfg.speed * 2.0;

                if (dist < waveFront + ringWidth && dist > waveFront - ringWidth) {
                    const envelope = rippleCfg.amplitude * Math.exp(-age * rippleCfg.decayRate);
                    const mask = Math.max(0, 1.0 - Math.abs(dist - waveFront) / ringWidth);
                    rippleHeight += Math.sin((dist - waveFront) * rippleCfg.frequency * TWO_PI) * envelope * mask;
                }
            }
            const depth = (p as any).mySubmersion || 1.3;

            const targetHeight = height + rippleHeight - depth; // can change param based on penguin weight

            p.position.y = p.position.y * 0.9 + targetHeight * 0.1;
            p.angle = Math.sin(time + p.position.x) * 0.1; // bobbing
        });
    }
});

engine.runRenderLoop(() => scene.render());
window.addEventListener("resize", () => engine.resize());

// -----------------------------
// Penguins + UI
// -----------------------------
const penguinManager = new SpriteManager(
    "penguinManager",
    "assets/penguin.png",
    100,
    { width: 700, height: 700 },
    scene
);

penguinManager.renderingGroupId = 1;

let interactionMode: "penguin" | "wave" = "wave";

const advancedTexture = GUI.AdvancedDynamicTexture.CreateFullscreenUI("UI");
const stackPanel = new GUI.StackPanel();
stackPanel.width = "220px";
stackPanel.horizontalAlignment = GUI.Control.HORIZONTAL_ALIGNMENT_LEFT;
stackPanel.verticalAlignment = GUI.Control.VERTICAL_ALIGNMENT_TOP;
advancedTexture.addControl(stackPanel);

const createButton = (text: string, mode: "penguin" | "wave") => {
    const btn = GUI.Button.CreateSimpleButton(mode, text);
    btn.height = "40px";
    btn.color = "white";
    btn.background = "#2196F3";
    btn.onPointerUpObservable.add(() => {
        interactionMode = mode;
        console.log("Switched to:", mode);
    });
    stackPanel.addControl(btn);
};

createButton("Create Wave", "wave");
createButton("Place Penguin", "penguin");

const SPLASH_RATIO = 0.25;

scene.onPointerDown = (evt, pickResult) => {
    if (!pickResult.hit || pickResult.pickedMesh?.name !== "water") return;

    // wave also happens for penguin
    const penCfg = OceanConfig.penguin;
    const idx = nextWaveIndex;
    const pos = pickResult.pickedPoint!;

    waveData[idx * 4 + 0] = pos.x;
    waveData[idx * 4 + 1] = rippleCfg.amplitude * (currentSize * SPLASH_RATIO);
    waveData[idx * 4 + 2] = pos.z;
    waveData[idx * 4 + 3] = (performance.now() - start) * 0.002;

    // waterShader.setFloat("waveAmplitude", rippleCfg.amplitude * penCfg.plopAmplitude);

    nextWaveIndex = (nextWaveIndex + 1) % MAX_WAVES;
    waveTexture.update(waveData);

    if (interactionMode === "penguin") {
        const penguin = new Sprite("penguin", penguinManager);
        penguin.width = currentSize;
        penguin.height = currentSize;
        const placementPos = pos.clone();
        placementPos.x += (currentSize / 4);

        penguin.position = placementPos;
        (penguin as any).mySubmersion = currentSubmersion;
        penguin.position.y += 0.0;
        console.log("Penguin deployed at:", penguin.position);
    }
};

const baseSkyColor = new Color4(0.7, 0.85, 1.0, 1.0);

const createSlider = (text: string, min: number, max: number, initial: number, onChange: (v: number) => void) => {
    const header = new GUI.TextBlock();
    header.text = `${text}`;
    header.height = "30px";
    header.color = "white";
    stackPanel.addControl(header);

    const slider = new GUI.Slider();
    slider.minimum = min;
    slider.maximum = max;
    slider.value = initial;
    slider.height = "20px";
    slider.width = "200px";
    slider.onValueChangedObservable.add((value) => {
        onChange(value);
    });
    stackPanel.addControl(slider);
};

// Choppiness Slider
createSlider("Choppiness", 0, 100.0, fftCfg.choppiness, (v) => {
    waterShader.setFloat("choppiness", v);
});

// Day/Night Sky Slider
// createSlider("Sky Light", 0.1, 1.0, OceanConfig.visuals.skyBrightness, (v) => {
//     waterShader.setFloat("skyBrightness", v);

//     scene.clearColor = new Color4(
//         baseSkyColor.r * v,
//         baseSkyColor.g * v,
//         baseSkyColor.b * v,
//         1.0
//     );
// });

const sunCutoff = 0.6;

const updateSun = (v: number) => {
    let angle: number;
    // remap: v=1 noon, v=0.3 horizon, v<0.3 stays at horizon
    if (v >= 0.5) {
        const remapped = Math.max(0, (v - sunCutoff) / (1 - sunCutoff));  // 0 at v=0.3, 1 at v=1
        angle = remapped * Math.PI / 3;  // 0 at horizon, PI/2 at noon
    } else {
        if (v > 0.45) {

            angle = 0;

        } else {

            // 0.4 -> 0 maps to 0 -> 1
            const remapped = (0.45 - v) / 0.45;

            angle = remapped * Math.PI / 3;
        }
        // const remapped = 1 - v / sunCutoff;
        // angle = remapped * Math.PI / 3;

    }

    // v=1 noon (high), v=0.5 horizon, v=0 below horizon (night)
    // const angle = Math.abs((v - 0.5) * Math.PI * 2 / 3);  // -PI/2 to PI/2
    const height = Math.sin(angle);      // -1 to 1
    const depth = Math.cos(angle);      // 1 at horizon, 0 at noon/night

    const sunPos = new Vector3(0, height * 60 - 10, depth * 140);
    sun.position = sunPos;

    // light comes FROM sun position, points toward origin
    const dir = sunPos.negate().normalize();
    sunLight.direction = dir;
    sunLight.position = sunPos;
    // sunLight.intensity = Math.max(0, height) * 2.5;
    if (v >= 0) {
        sunLight.intensity = Math.max(0, height) * 2.5;
    } else {
        sunLight.intensity = Math.pow(Math.abs(v), 2.0) * 0.3;
    }

    waterShader.setVector3("sunDirection", new Vector3(dir.x, dir.y, dir.z));

    if (v > sunCutoff) {
        // sun — full size, warm yellow
        sun.scaling = new Vector3(1.0, 1.0, 1.0);
    } else if (v < 0.5) {
        // moon — smaller, pale blue-white
        // sun.scaling = new Vector3(1.0, 1.0, 1.0);
        sun.scaling = new Vector3(0.75, 0.75, 0.75);
    }
    // const glowIntensity = v > sunCutoff
    //     ? 0.5 + (1.0 - (v - 0.5) * 2.0) * 0.8  // noon=0.5, sunset=1.3
    //     : v * 2.0 * 0.4;                          // night=0, sunset=0.8

};

const updateEnvironment = (v: number) => {
    let finalColor: Color3;
    let sunColor: Color3;
    let sunAlpha = 1.0;
    const vis = OceanConfig.visuals;

    if (v > sunCutoff) {
        const t = (v - sunCutoff) / (1 - sunCutoff);
        finalColor = Color3.Lerp(vis.sunsetColor, vis.noonColor, t);
        sunColor = finalColor;
        sunAlpha = 1.0;
    } else if (v > 0.5) {
        const t = (v - 0.5) / (sunCutoff - 0.5);
        finalColor = Color3.Lerp(vis.nightColor, vis.sunsetColor, t);
        sunColor = vis.sunsetColor;
        sunAlpha = Math.pow(t, 2.0);
    } else {
        finalColor = vis.nightColor;
        sunColor = vis.moonColor;
        const t = Math.max(0.0, Math.min(1.0, (0.5 - v) / (sunCutoff - 0.5))
        );
        sunAlpha = Math.pow(t, 4.0);
    }
    sunMat.alpha = sunAlpha;
    // const glowIntensity =
    //     v > sunCutoff
    //         ? 0.5 + (1.0 - (v - 0.5) * 2.0) * 0.8
    //         : Math.pow(v, 4.0) * 20.0;
    glowLayer.intensity = sunAlpha;

    scene.fogColor = new Color3(finalColor.r, finalColor.g, finalColor.b);

    waterShader.setVector3("dynamicSkyColor", new Vector3(finalColor.r, finalColor.g, finalColor.b));
    waterShader.setFloat("lightIntensity", 0.2 + v * 0.8);  // same as light.intensity
    scene.clearColor = new Color4(finalColor.r, finalColor.g, finalColor.b, 1.0);

    // const light = scene.getLightByName("light") as HemisphericLight;
    if (hemiLight) {
        hemiLight.diffuse = finalColor;
        hemiLight.intensity = 0.2 + v * 0.8;
    }

    updateSun(v);

    let finalSunColor: Color3;
    if (v >= 0.5) {
        finalSunColor = new Color3(
            Math.min(1.0, sunColor.r * 1.3),
            Math.min(1.0, sunColor.g * 1.1),
            Math.min(1.0, sunColor.b * 0.8)
        )
    } else {
        finalSunColor = sunColor;
    }
    finalSunColor = finalSunColor.scale(sunAlpha)

    sunMat.emissiveColor = finalSunColor;

    sunLight.diffuse = finalSunColor;
    sunLight.specular = finalSunColor;

    waterShader.setVector3(
        "sunColor",
        new Vector3(finalSunColor.r, finalSunColor.g, finalSunColor.b)
    );

    // sunMat.emissiveColor = new Color3(
    //     Math.min(1.0, sunColor.r * 1.3),
    //     Math.min(1.0, sunColor.g * 1.1),
    //     Math.min(1.0, sunColor.b * 0.8)
    // ).scale(sunAlpha);

    // sunLight.diffuse = new Color3(
    //     Math.min(1.0, sunColor.r * 1.3),
    //     Math.min(1.0, sunColor.g * 1.1),
    //     Math.min(1.0, sunColor.b * 0.8)
    // ).scale(sunAlpha);
    // sunLight.specular = new Color3(
    //     Math.min(1.0, sunColor.r * 1.3),
    //     Math.min(1.0, sunColor.g * 1.1),
    //     Math.min(1.0, sunColor.b * 0.8)
    // ).scale(sunAlpha);

    // waterShader.setVector3("sunColor", new Vector3(
    //     Math.min(1.0, sunColor.r * 1.3),
    //     Math.min(1.0, sunColor.g * 1.1),
    //     Math.min(1.0, sunColor.b * 0.8)
    // ).scale(sunAlpha));
};

createSlider("Time of Day", 0, 1, OceanConfig.visuals.skyBrightness, (v) => {
    updateEnvironment(v);
});

updateEnvironment(OceanConfig.visuals.skyBrightness);

let currentSize = 2.0;
let currentSubmersion = 0.5;

createSlider("Penguin Scale", 2.0, 20.0, 8.0, (v) => {
    const SUBMERSION_RATIO = 0.3; // toggle with these
    const SPLASH_RATIO = 0.1; // toggle with these

    // OceanConfig.penguin.size = v; 
    // OceanConfig.penguin.submersion = v * SUBMERSION_RATIO;
    currentSize = v;
    currentSubmersion = v * SUBMERSION_RATIO;

    waterShader.setFloat("waveAmplitude", rippleCfg.amplitude * (v * SPLASH_RATIO));

    // penguinManager.sprites.forEach(p => {
    //     p.width = v;
    //     p.height = v;
    // });
});