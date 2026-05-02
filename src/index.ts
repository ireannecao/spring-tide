import { Engine } from "@babylonjs/core/Engines/engine";
import { Scene } from "@babylonjs/core/scene";

import { ArcRotateCamera } from "@babylonjs/core/Cameras/arcRotateCamera";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";

import { HemisphericLight } from "@babylonjs/core/Lights/hemisphericLight";

import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";

import { ShaderMaterial } from "@babylonjs/core/Materials/shaderMaterial";
import { Effect } from "@babylonjs/core/Materials/effect";

// REQUIRED for ShaderMaterial internals
import "@babylonjs/core/Materials/standardMaterial";

const canvas = document.getElementById("renderCanvas") as HTMLCanvasElement;
const engine = new Engine(canvas, true);

const scene = new Scene(engine);

// -----------------------------
// Camera
// -----------------------------
const camera = new ArcRotateCamera(
    "cam",
    Math.PI / 2,
    Math.PI / 3,
    30,
    Vector3.Zero(),
    scene
);

camera.attachControl(canvas, true);

// -----------------------------
// Light
// -----------------------------
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
// Shader code (embedded)
// -----------------------------
const vertexShader = `
precision highp float;

attribute vec3 position;
uniform mat4 worldViewProjection;
uniform float time;

varying float vHeight;

void main() {
  vec3 p = position;

  float wave =
      sin(p.x * 0.2 + time) * 0.5 +
      sin(p.z * 0.3 + time * 1.2) * 0.3 +
      sin((p.x + p.z) * 0.1 + time * 0.8) * 0.2;

  p.y = wave;
  vHeight = wave;

  gl_Position = worldViewProjection * vec4(p, 1.0);
}
`;

const fragmentShader = `
precision highp float;

varying float vHeight;

void main() {
  vec3 deep = vec3(0.0, 0.2, 0.5);
  vec3 shallow = vec3(0.2, 0.5, 0.8);

  float t = vHeight * 0.5 + 0.5;

  gl_FragColor = vec4(mix(deep, shallow, t), 1.0);
}
`;

// -----------------------------
// Register shaders (IMPORTANT)
// -----------------------------
Effect.ShadersStore["waterVertexShader"] = vertexShader;
Effect.ShadersStore["waterFragmentShader"] = fragmentShader;

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
