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

(window as any).Effect_Index = Effect;

import "@babylonjs/core/Materials/standardMaterial";
import "@babylonjs/core/Culling/ray";
import * as GUI from "@babylonjs/gui/2D";
import { OceanConfig } from "./config";

const canvas = document.getElementById("renderCanvas") as HTMLCanvasElement;
const engine = new Engine(canvas, true);

const scene = new Scene(engine);

const camera = new ArcRotateCamera(
    "cam",
    Math.PI / 2,
    Math.PI / 3,
    30,
    Vector3.Zero(),
    scene
);

// camera.attachControl(canvas, true);
// temp disable moving -> set specific location
camera.setPosition(new Vector3(0, 40, -50));

new HemisphericLight("light", new Vector3(0, 1, 0), scene);

// -----------------------------
// Geometry
// -----------------------------
const water = MeshBuilder.CreateGround(
    "water",
    {
        width: 50,
        height: 50,
        subdivisions: 200,
    },
    scene
);
water.alwaysSelectAsActiveMesh = true;

// -----------------------------
// Register shaders (IMPORTANT)
// -----------------------------
Effect.ShadersStore["waterVertexShader"] = waterVertex;
Effect.ShadersStore["waterFragmentShader"] = waterFragment;

// -----------------------------
// Shader material
// -----------------------------
const waterShader = new ShaderMaterial(
    "waterShader",
    scene,
    {
        vertex: "water",
        fragment: "water",
    },
    {
        attributes: ["position", "uv"],
        uniforms: [
            "worldViewProjection",
            "time",
            "waveSpeed",
            "waveFrequency",
            "waveAmplitude",
            "decayRate",
            "maxAge",
            "maxWaves",
        ],
        samplers: ["waveTexture", "displacementMap"]
    }
);
const cfg = OceanConfig.ripple;
waterShader.setFloat("waveSpeed",     cfg.speed);
waterShader.setFloat("waveFrequency", cfg.frequency);
waterShader.setFloat("waveAmplitude", cfg.amplitude);
waterShader.setFloat("decayRate",     cfg.decayRate);
waterShader.setFloat("maxAge",        cfg.maxAge);

// waterShader.setFloat("waveTime", -1); // explicitly disable
// waterShader.setVector3("clickPos", new Vector3(9999, 9999, 9999));

water.material = waterShader;

const MAX_WAVES = 32;

const waveData = new Float32Array(MAX_WAVES * 4);
for (let i = 0; i < MAX_WAVES; i++) {
    // waveData[i * 4 + 0] = 0.0;   // x (doesn't matter yet)
    // waveData[i * 4 + 1] = 0.0;   // y
    // waveData[i * 4 + 2] = 0.0;   // z
    waveData[i * 4 + 3] = -1.0;  // time = INVALID
}

const waveTexture = new RawTexture(
    waveData,
    MAX_WAVES,
    1,
    Constants.TEXTUREFORMAT_RGBA,
    scene,
    false,
    false,
    Texture.NEAREST_SAMPLINGMODE,
    Engine.TEXTURETYPE_FLOAT
);

let nextWaveIndex = 0;

waterShader.setTexture("waveTexture", waveTexture);
waterShader.setFloat("maxWaves", MAX_WAVES);

// waterShader.getEffect().onCompileObservable.add(() => {
//     console.log("Shader compiled successfully");
// });

// -----------------------------
// Displacement Texture
// -----------------------------

const N = 64;

const displacementData = generatePhillipsSpectrum({
    N,
    L: 50,           // real world size of a single tile, so we want this to be the same as mesh width/height
    windSpeed: 12,   // in m/s
    windDirX: 1.0,
    windDirZ: 0.0,
    amplitude: 40.0,
});

let nonZeroCount = 0;
for(let i = 0; i < displacementData.length; i++) {
    if(Math.abs(displacementData[i]) > 0.000001) nonZeroCount++;
}
console.log(`Spectrum Report: ${nonZeroCount} / ${displacementData.length} values are non-zero.`);
console.log("Sample Data:", displacementData.slice(0, 8));

const nonZero = Array.from(displacementData).filter(v => Math.abs(v) > 0.001).length;
const maxVal = Math.max(...Array.from(displacementData).map(Math.abs));
console.log(`[Phillips] Non-zero values: ${nonZero} / ${displacementData.length}, max: ${maxVal}`);

// const displacementTexture = new RawTexture(
//     displacementData,
//     N,
//     N,
//     Constants.TEXTUREFORMAT_RGBA,
//     scene,
//     false,
//     false,
//     Texture.NEAREST_SAMPLINGMODE,
//     Engine.TEXTURETYPE_FLOAT
// );

// waterShader.setTexture("displacementMap", displacementTexture);


const h0Texture = new RawTexture(
    displacementData,       // your existing phillipsSpectrum output
    N, N,
    Constants.TEXTUREFORMAT_RGBA,
    scene, false, false,
    Texture.NEAREST_SAMPLINGMODE,
    Engine.TEXTURETYPE_FLOAT
);

console.log("[h0Texture] isReady:", h0Texture.isReady());
console.log("[h0Texture] getSize:", h0Texture.getSize());
console.log("[h0Texture] internal texture:", h0Texture.getInternalTexture());

const oceanFFT = new OceanFFT(scene, h0Texture, N, 50, /* autoRun= */ false);
console.log("[OceanFFT RTT] isReady:", oceanFFT.displacementTexture.isReady());
console.log("[OceanFFT RTT] getSize:", oceanFFT.displacementTexture.getSize());
const butterflyPass = new ButterflyPass(scene, oceanFFT.displacementTexture, N, /* autoRun= */ false);


// waterShader.setTexture("displacementMap", oceanFFT.displacementTexture);
waterShader.setTexture("displacementMap", butterflyPass.displacementTexture);


// -----------------------------
// Animation
// -----------------------------
const start = performance.now();
let debugFrameCount = 0;scene.onAfterRenderObservable.add(async () => {
    debugFrameCount++;
    if (debugFrameCount !== 240) return;

    const N = 64;

    // --- 1. OceanFFT output (h(k,t) — should be non-zero, changing each frame) ---
    const fftPixels = await oceanFFT.displacementTexture.readPixels(0, 0, undefined, false);
    const fftFloats = new Float32Array(fftPixels!.buffer);
    const fftR = Array.from({length: N*N}, (_, i) => fftFloats[i*4]);
    console.log(`[OceanFFT] max=${Math.max(...fftR.map(Math.abs)).toFixed(4)}, nonZero=${fftR.filter(v=>Math.abs(v)>0.0001).length}/${N*N}`);
    console.log(`[OceanFFT] first 4 R:`, fftR.slice(0,4));

    // --- 2. ButterflyPass pingPong[0] — intermediate FFT buffer ---
    const pp0Pixels = await (butterflyPass as any)._pingPong[0].readPixels(0, 0, undefined, false);
const pp0Floats = new Float32Array(pp0Pixels!.buffer);
const pp0R = Array.from({length: N*N}, (_, i) => pp0Floats[i*4]);
console.log(`[PingPong0] first 4 R:`, pp0R.slice(0,4));
console.log(`[PingPong0] pixel 32:`, pp0R[32], `pixel 33:`, pp0R[33]);

const pp1Pixels = await (butterflyPass as any)._pingPong[1].readPixels(0, 0, undefined, false);
const pp1Floats = new Float32Array(pp1Pixels!.buffer);
const pp1R = Array.from({length: N*N}, (_, i) => pp1Floats[i*4]);
console.log(`[PingPong1] first 4 R:`, pp1R.slice(0,4));
console.log(`[PingPong1] min=${Math.min(...pp1R).toFixed(6)}, max=${Math.max(...pp1R).toFixed(6)}`);

// Also check: which pingPong buffer does the inversion pass actually read from?
// After 6 horiz + 6 vert passes = 12 swaps, readBuf = 0 (even)
// So inversion reads pingPong[0] — let's verify its spatial structure
const uniqueVals = new Set(pp0R.map(v => v.toFixed(4))).size;
console.log(`[PingPong0] unique values:`, uniqueVals, `(should be ~4096, not 1)`);

    // --- 3. ButterflyPass final displacement output ---
    const bpPixels = await butterflyPass.displacementTexture.readPixels(0, 0, undefined, false);
    const bpFloats = new Float32Array(bpPixels!.buffer);
    const bpR = Array.from({length: N*N}, (_, i) => bpFloats[i*4]);
    console.log(`[Butterfly out] max=${Math.max(...bpR.map(Math.abs)).toFixed(4)}, nonZero=${bpR.filter(v=>Math.abs(v)>0.0001).length}/${N*N}`);
    console.log(`[Butterfly out] first 4 R:`, bpR.slice(0,4));
    console.log(`[Butterfly out] min=${Math.min(...bpR).toFixed(6)}, max=${Math.max(...bpR).toFixed(6)}`);

    // --- 4. Run it again at frame 241 to check stability ---
    if (debugFrameCount === 240) {
        setTimeout(async () => {
            const bpPixels2 = await butterflyPass.displacementTexture.readPixels(0, 0, undefined, false);
            const bpFloats2 = new Float32Array(bpPixels2!.buffer);
            const bpR2 = Array.from({length: N*N}, (_, i) => bpFloats2[i*4]);
            console.log(`[Butterfly out frame+1] first 4 R:`, bpR2.slice(0,4));
            console.log(`[Butterfly out frame+1] max=${Math.max(...bpR2.map(Math.abs)).toFixed(4)}`);
            // If these 4 values differ significantly from above, output is unstable frame-to-frame
        }, 100); // ~6 frames at 60fps
    }

    const invPixels = await butterflyPass.displacementTexture.readPixels(0, 0, undefined, false);
const invFloats = new Float32Array(invPixels!.buffer);
// If vUV.x is the R channel, pixel[0].r should be ~0, pixel[63].r should be ~1
console.log(`[Inversion vUV debug] pixel[0] RG:`, invFloats[0].toFixed(4), invFloats[1].toFixed(4));
console.log(`[Inversion vUV debug] pixel[63] RG:`, invFloats[63*4].toFixed(4), invFloats[63*4+1].toFixed(4));
console.log(`[Inversion vUV debug] pixel[4095] RG:`, invFloats[4095*4].toFixed(4), invFloats[4095*4+1].toFixed(4));
    // Read the butterfly LUT directly
const lutPixels = await (butterflyPass as any)._butterflyLUT.readPixels(0, 0, undefined, false);
const lutFloats = new Float32Array(lutPixels!.buffer);
// Stage 0, k=0: should have twiddle + two different indices
console.log(`[ButterflyLUT] k=0,stage=0: twiddle=(${lutFloats[0].toFixed(3)},${lutFloats[1].toFixed(3)}) top=${lutFloats[2]} bottom=${lutFloats[3]}`);
// k=1,stage=0
const o = 4 * 6; // k=1 starts at offset log2N*4 = 24
console.log(`[ButterflyLUT] k=1,stage=0: twiddle=(${lutFloats[o].toFixed(3)},${lutFloats[o+1].toFixed(3)}) top=${lutFloats[o+2]} bottom=${lutFloats[o+3]}`);
});
console.log("WebGL version:", engine.webGLVersion);


scene.onBeforeRenderObservable.add(() => {
    const time = (performance.now() - start) * 0.001;

    // console.log("[RenderLoop] tick, time:", time.toFixed(2)); // remove after confirmed working

    waterShader.setTexture("displacementMap", oceanFFT.displacementTexture);
    // waterShader.setTexture("displacementMap", null as any);

    oceanFFT.update(time);
    oceanFFT.runPass();

    butterflyPass.runPass();

    waterShader.setFloat("time", time);
    waterShader.setTexture("displacementMap", butterflyPass.displacementTexture);

    penguinManager.sprites.forEach((p) => {
        const wave =
            Math.sin(p.position.x * 0.2 + time) * 0.5 +
            Math.sin(p.position.z * 0.3 + time * 1.2) * 0.3;
        p.position.y = wave;
        p.angle = Math.cos(p.position.x * 0.5 + time) * 0.2;
    });
});


// scene.registerBeforeRender(() => {
//     const time = (performance.now() - start) * 0.001;
//     waterShader.setFloat("time", time);
//     oceanFFT.update(time);

//     penguinManager.sprites.forEach((p) => {
//         // add back in if we want it to move with created touch wave
//         // const age = time - lastClickTime;
//         // const speed = 6.0;
//         // const thickness = 5.0;
//         // const waveFront = age * speed;
//         const wave =
//             Math.sin(p.position.x * 0.2 + time) * 0.5 +
//             Math.sin(p.position.z * 0.3 + time * 1.2) * 0.3;

//         p.position.y = wave;
//         p.angle = Math.cos(p.position.x * 0.5 + time) * 0.2;

//     });
// });

//------------------------------
// Penguins
//------------------------------

const penguinManager = new SpriteManager(
    "penguinManager",
    "assets/penguin.png",
    100,
    { width: 700, height: 700 },
    scene
);

let interactionMode: "penguin" | "wave" = "penguin";

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

createButton("Place Penguin", "penguin");
createButton("Create Wave", "wave");

// let lastClickTime = -999.0;


scene.onPointerDown = (evt, pickResult) => {
    if (pickResult.hit && pickResult.pickedMesh?.name === "water") {
        if (interactionMode === "penguin") {
            const penguin = new Sprite("penguin", penguinManager);

            penguin.width = 8.0;
            penguin.height = 8.0;

            penguin.position = pickResult.pickedPoint!.clone();

            penguin.position.y += -1.5;

            console.log("Penguin deployed to waves at:", penguin.position);
        }

        else { // create save mode
            const idx = nextWaveIndex;

            const pos = pickResult.pickedPoint!;

            waveData[idx * 4 + 0] = pos.x;
            waveData[idx * 4 + 1] = pos.y;
            waveData[idx * 4 + 2] = pos.z;
            waveData[idx * 4 + 3] = (performance.now() - start) * 0.001;

            nextWaveIndex = (nextWaveIndex + 1) % MAX_WAVES;

            waveTexture.update(waveData);
            // const pos = pickResult.pickedPoint!;
            // waterShader.setVector3("clickPos", new Vector3(pos.x, pos.y, pos.z));
            // lastClickTime = (performance.now() - start) * 0.001;
            // waterShader.setFloat("waveTime", lastClickTime);
        }
    }
};

// -----------------------------
// Render loop
// -----------------------------
engine.runRenderLoop(() => {
    scene.render();
});

window.addEventListener("resize", () => {
    engine.resize();
});