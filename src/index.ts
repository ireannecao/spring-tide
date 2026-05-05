import { Engine } from "@babylonjs/core/Engines/engine";
import { Scene } from "@babylonjs/core/scene";
import { ArcRotateCamera } from "@babylonjs/core/Cameras/arcRotateCamera";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { HemisphericLight } from "@babylonjs/core/Lights/hemisphericLight";
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
import "@babylonjs/core/Materials/standardMaterial";
import "@babylonjs/core/Culling/ray";
import { Color3, Color4 } from "@babylonjs/core";
import * as GUI from "@babylonjs/gui/2D";

// ─── Single source of truth ───────────────────────────────────────────────────
import { OceanConfig } from "./config";
const { fft: fftCfg, ripple: rippleCfg, visuals: vis } = OceanConfig;
// ─────────────────────────────────────────────────────────────────────────────

(window as any).Effect_Index = Effect;

const canvas  = document.getElementById("renderCanvas") as HTMLCanvasElement;
const engine  = new Engine(canvas, true);
const scene   = new Scene(engine);

const camera = new ArcRotateCamera("cam", Math.PI / 2, Math.PI / 3, 30, Vector3.Zero(), scene);
// camera.attachControl(canvas, true);
camera.setPosition(new Vector3(0, 8, -50));
new HemisphericLight("light", new Vector3(0, 1, 0), scene);

// -----------------------------
// Geometry — L drives mesh size
// -----------------------------
const water = MeshBuilder.CreateGround(
    "water",
    {
        width:        fftCfg.L,  
        height:       fftCfg.L,   
        subdivisions: 200,
    },
    scene
);
water.alwaysSelectAsActiveMesh = true;

// -----------------------------
// Register shaders
// -----------------------------
Effect.ShadersStore["waterVertexShader"]   = waterVertex;
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
        ],
        samplers: ["waveTexture", "displacementMap"],
    }
);

// Ripple uniforms from config
waterShader.setFloat("waveSpeed",          rippleCfg.speed);
waterShader.setFloat("waveFrequency",      rippleCfg.frequency);
waterShader.setFloat("waveAmplitude",      rippleCfg.amplitude);
waterShader.setFloat("decayRate",          rippleCfg.decayRate);
waterShader.setFloat("maxAge",             rippleCfg.maxAge);

// FFT displacement scale — replaces the magic * 8.0 in the old shader
waterShader.setFloat("displacementScale",  fftCfg.displacementScale);

// sliders control this
waterShader.setFloat("choppiness", fftCfg.choppiness);
waterShader.setFloat("skyBrightness", OceanConfig.visuals.skyBrightness);

water.material = waterShader;

// -----------------------------
// Click-wave texture
// -----------------------------
const MAX_WAVES = 32;
const waveData  = new Float32Array(MAX_WAVES * 4);
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

const nonZero = Array.from(displacementData).filter(v => Math.abs(v) > 0.001).length;
const maxVal  = Math.max(...Array.from(displacementData).map(Math.abs));
console.log(`[Phillips] Non-zero: ${nonZero} / ${displacementData.length}, max: ${maxVal}`);

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
const oceanFFT     = new OceanFFT(scene, h0Texture, fftCfg.N, fftCfg.L, /* autoRun= */ false);
const butterflyPass = new ButterflyPass(scene, oceanFFT.displacementTexture, fftCfg.N, /* autoRun= */ false);

waterShader.setTexture("displacementMap", butterflyPass.displacementTexture);

// -----------------------------
// Debug readback (frame 240)
// -----------------------------
const start = performance.now();
let debugFrameCount = 0;

scene.onAfterRenderObservable.add(async () => {
    debugFrameCount++;
    if (debugFrameCount !== 240) return;

    const N = fftCfg.N; // was a separate hard-coded `const N = 64`

    const fftPixels  = await oceanFFT.displacementTexture.readPixels(0, 0, undefined, false);
    const fftFloats  = new Float32Array(fftPixels!.buffer);
    const fftR       = Array.from({ length: N * N }, (_, i) => fftFloats[i * 4]);
    console.log(`[OceanFFT] max=${Math.max(...fftR.map(Math.abs)).toFixed(4)}, nonZero=${fftR.filter(v => Math.abs(v) > 0.0001).length}/${N * N}`);

    const bpPixels = await butterflyPass.displacementTexture.readPixels(0, 0, undefined, false);
    const bpFloats = new Float32Array(bpPixels!.buffer);
    const bpR      = Array.from({ length: N * N }, (_, i) => bpFloats[i * 4]);
    console.log(`[Butterfly out] max=${Math.max(...bpR.map(Math.abs)).toFixed(4)}, nonZero=${bpR.filter(v => Math.abs(v) > 0.0001).length}/${N * N}`);
});

console.log("WebGL version:", engine.webGLVersion);

// -----------------------------
// Render loop
// -----------------------------
let displacementBuffer: Float32Array | null = null;
let isFetching = false;

scene.onBeforeRenderObservable.add(() => {
    const time = (performance.now() - start) * 0.001;

    oceanFFT.update(time);
    oceanFFT.runPass();
    butterflyPass.runPass();

    if (!isFetching) {
        isFetching = true;
        butterflyPass.getDisplacementData().then((data) => {
            displacementBuffer = data;
            isFetching = false;
        });
    }

    waterShader.setVector3("vEyePosition", camera.position);

    waterShader.setFloat("time", time);
    waterShader.setTexture("displacementMap", butterflyPass.displacementTexture);

    if (displacementBuffer != null) {
        const N = fftCfg.N;
        const L = fftCfg.L;
        penguinManager.sprites.forEach((p) => {
            const u = (p.position.x / L) + 0.5;
            const v = (p.position.z / L) + 0.5;

            const xPixel = Math.max(0, Math.min(N - 1, Math.floor(u * N)));
            const yPixel = Math.max(0, Math.min(N - 1, Math.floor(v * N)));

            const pixelIdx = (yPixel * N + xPixel) * 4;
            const fftHeight = displacementBuffer![pixelIdx] * fftCfg.displacementScale;

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

            const targetHeight = fftHeight + rippleHeight - depth; // can change param based on penguin weight

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

let interactionMode: "penguin" | "wave" = "penguin";

const advancedTexture = GUI.AdvancedDynamicTexture.CreateFullscreenUI("UI");
const stackPanel      = new GUI.StackPanel();
stackPanel.width = "220px";
stackPanel.horizontalAlignment = GUI.Control.HORIZONTAL_ALIGNMENT_LEFT;
stackPanel.verticalAlignment   = GUI.Control.VERTICAL_ALIGNMENT_TOP;
advancedTexture.addControl(stackPanel);

const createButton = (text: string, mode: "penguin" | "wave") => {
    const btn = GUI.Button.CreateSimpleButton(mode, text);
    btn.height     = "40px";
    btn.color      = "white";
    btn.background = "#2196F3";
    btn.onPointerUpObservable.add(() => {
        interactionMode = mode;
        console.log("Switched to:", mode);
    });
    stackPanel.addControl(btn);
};
createButton("Place Penguin", "penguin");
createButton("Create Wave",   "wave");

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
    waveData[idx * 4 + 3] = (performance.now() - start) * 0.001;

    waterShader.setFloat("waveAmplitude", rippleCfg.amplitude * penCfg.plopAmplitude);

    nextWaveIndex = (nextWaveIndex + 1) % MAX_WAVES;
    waveTexture.update(waveData);

    if (interactionMode === "penguin") {
        const penguin = new Sprite("penguin", penguinManager);
        penguin.width = currentSize;
        penguin.height = currentSize;
        penguin.position = pos.clone();
        (penguin as any).mySubmersion = currentSubmersion;
        penguin.position.y += -12.0;
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
createSlider("Choppiness", 0, 2.0, fftCfg.choppiness, (v) => {
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
const updateEnvironment = (v: number) => {
    let finalColor: Color3;
    const vis = OceanConfig.visuals;

    if (v > 0.5) {
        const t = (v - 0.5) * 2.0;
        finalColor = Color3.Lerp(vis.sunsetColor, vis.noonColor, t);
    } else {
        const t = v * 2.0;
        finalColor = Color3.Lerp(vis.nightColor, vis.sunsetColor, t);
    }

    waterShader.setVector3("dynamicSkyColor", new Vector3(finalColor.r, finalColor.g, finalColor.b));
    scene.clearColor = new Color4(finalColor.r, finalColor.g, finalColor.b, 1.0);

    const light = scene.getLightByName("light") as HemisphericLight;
    if (light) {
        light.diffuse = finalColor;
        light.intensity = 0.2 + v * 0.8;
    }
};

createSlider("Time of Day", 0, 1, OceanConfig.visuals.skyBrightness, (v) => {
    updateEnvironment(v);
});

updateEnvironment(OceanConfig.visuals.skyBrightness);

let currentSize = 8.0;
let currentSubmersion = 1.3;

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