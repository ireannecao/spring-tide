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
import * as GUI from "@babylonjs/gui/2D";

// ─── Single source of truth ───────────────────────────────────────────────────
import { OceanConfig } from "./config";
const { fft: fftCfg, ripple: rippleCfg } = OceanConfig;
// ─────────────────────────────────────────────────────────────────────────────

(window as any).Effect_Index = Effect;

const canvas  = document.getElementById("renderCanvas") as HTMLCanvasElement;
const engine  = new Engine(canvas, true);
const scene   = new Scene(engine);

const camera = new ArcRotateCamera("cam", Math.PI / 2, Math.PI / 3, 30, Vector3.Zero(), scene);
camera.attachControl(canvas, true);
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
            const realHeight = displacementBuffer![pixelIdx] * fftCfg.displacementScale;

            p.position.y = realHeight - 1.0;
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

scene.onPointerDown = (evt, pickResult) => {
    if (!pickResult.hit || pickResult.pickedMesh?.name !== "water") return;

    if (interactionMode === "penguin") {
        const penguin    = new Sprite("penguin", penguinManager);
        penguin.width    = 8.0;
        penguin.height   = 8.0;
        penguin.position = pickResult.pickedPoint!.clone();
        penguin.position.y += -12.0;
        console.log("Penguin deployed at:", penguin.position);
    } else {
        const idx = nextWaveIndex;
        const pos = pickResult.pickedPoint!;
        waveData[idx * 4 + 0] = pos.x;
        waveData[idx * 4 + 1] = pos.y;
        waveData[idx * 4 + 2] = pos.z;
        waveData[idx * 4 + 3] = (performance.now() - start) * 0.001;
        nextWaveIndex = (nextWaveIndex + 1) % MAX_WAVES;
        waveTexture.update(waveData);
    }
};