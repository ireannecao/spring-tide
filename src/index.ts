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

import { SpriteManager } from "@babylonjs/core/Sprites/spriteManager";
import { Sprite } from "@babylonjs/core/Sprites/sprite";

import "@babylonjs/core/Materials/standardMaterial";
import "@babylonjs/core/Culling/ray";
import * as GUI from "@babylonjs/gui/2D";

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
        uniforms: [
            "worldViewProjection",
            "time",
            "clickPos",
            "waveTime",
            "maxAge",
            "speed",
            "padding"
        ],
    }
);

waterShader.setFloat("maxAge", 3.0);
waterShader.setFloat("speed", 6.0);
waterShader.setFloat("padding", 2.0);
waterShader.setFloat("waveTime", -1); // explicitly disable
waterShader.setVector3("clickPos", new Vector3(9999, 9999, 9999));

water.material = waterShader;

// -----------------------------
// Animation
// -----------------------------
const start = performance.now();

scene.registerBeforeRender(() => {
    const time = (performance.now() - start) * 0.001;
    waterShader.setFloat("time", time);

    penguinManager.sprites.forEach((p) => {
        // add back in if we want it to move with created touch wave
        // const age = time - lastClickTime;
        // const speed = 6.0;
        // const thickness = 5.0;
        // const waveFront = age * speed;
        const wave =
            Math.sin(p.position.x * 0.2 + time) * 0.5 +
            Math.sin(p.position.z * 0.3 + time * 1.2) * 0.3;

        p.position.y = wave;
        p.angle = Math.cos(p.position.x * 0.5 + time) * 0.2;

    });
});

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

let lastClickTime = -999.0;

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
            const pos = pickResult.pickedPoint!;
            waterShader.setVector3("clickPos", new Vector3(pos.x, pos.y, pos.z));
            lastClickTime = (performance.now() - start) * 0.001;
            waterShader.setFloat("waveTime", lastClickTime);
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