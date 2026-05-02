import { Engine } from "@babylonjs/core/Engines/engine";
import { Scene } from "@babylonjs/core/scene";

import { ArcRotateCamera } from "@babylonjs/core/Cameras/arcRotateCamera";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";

import { HemisphericLight } from "@babylonjs/core/Lights/hemisphericLight";

import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";

import { ShaderMaterial } from "@babylonjs/core/Materials/shaderMaterial";
import waterVertex from "./shaders/water.vertex.fx";
import waterFragment from "./shaders/water.fragment.fx";

import { Effect } from "@babylonjs/core/Materials/effect";

import "@babylonjs/core/Materials/standardMaterial";

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

camera.attachControl(canvas, true);

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
        attributes: ["position"],
        uniforms: ["worldViewProjection", "time"],
    }
);

water.material = waterShader;

// -----------------------------
// Animation
// -----------------------------
const start = performance.now();

scene.registerBeforeRender(() => {
    const time = (performance.now() - start) * 0.001;
    waterShader.setFloat("time", time);
});

// -----------------------------
// Render loop
// -----------------------------
engine.runRenderLoop(() => {
    scene.render();
});

window.addEventListener("resize", () => {
    engine.resize();
});

// import { Engine } from "@babylonjs/core/Engines/engine";
// import { Scene } from "@babylonjs/core/scene";
// import { AppendSceneAsync } from "@babylonjs/core/Loading/sceneLoader";
// import { ArcRotateCamera } from "@babylonjs/core/Cameras/arcRotateCamera";

// // Side-effect imports: these register plugins and augment prototypes at load time
// import "@babylonjs/core/Loading/loadingScreen";
// import "@babylonjs/core/Helpers/sceneHelpers";
// import "@babylonjs/core/Materials/standardMaterial";
// import "@babylonjs/core/Materials/PBR/pbrMaterial";
// import "@babylonjs/core/Materials/Textures/Loaders/envTextureLoader";
// import "@babylonjs/loaders/glTF";

// const canvas = document.getElementById("renderCanvas") as HTMLCanvasElement;
// const engine = new Engine(canvas, true);

// const createScene = async () => {
//     const scene = new Scene(engine);

//     // Load a glTF model
//     await AppendSceneAsync("https://assets.babylonjs.com/meshes/boombox.glb", scene);

//     // Create a default camera that frames the loaded model
//     scene.createDefaultCamera(true, true, true);
//     // Rotate the camera to face the front of the model
//     (scene.activeCamera as ArcRotateCamera).alpha += Math.PI;

//     // Create a default environment (skybox + ground + environment lighting)
//     scene.createDefaultEnvironment({
//         createGround: true,
//         createSkybox: true,
//     });

//     return scene;
// };

// createScene().then((scene) => {
//     engine.runRenderLoop(() => {
//         scene.render();
//     });
// });

// window.addEventListener("resize", () => {
//     engine.resize();
// });
