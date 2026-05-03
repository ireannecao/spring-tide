import { Scene } from "@babylonjs/core/scene";
import { Effect } from "@babylonjs/core/Materials/effect";
import { RenderTargetTexture } from "@babylonjs/core/Materials/Textures/renderTargetTexture";
import { RawTexture } from "@babylonjs/core/Materials/Textures/rawTexture";
import { Constants } from "@babylonjs/core/Engines/constants";
import { EffectRenderer, EffectWrapper } from "@babylonjs/core/Materials/effectRenderer";

import timeEvolutionFrag from "../shaders/timeEvolution.fragment.fx";

console.log("shader length:", timeEvolutionFrag?.length);
console.log("shader preview:", timeEvolutionFrag?.slice(0, 80));

export class OceanFFT {
    public displacementTexture: RenderTargetTexture;

    private _effectRenderer: EffectRenderer;
    private _timeEvolutionEffect: EffectWrapper;
    private _h0Texture: RawTexture;
    private _N: number;
    private _L: number;
    private _time: number = 0;

    constructor(
        scene: Scene,
        h0Texture: RawTexture,
        N: number,
        L: number
    ) {
        this._N = N;
        this._L = L;
        this._h0Texture = h0Texture;

        const engine = scene.getEngine();

        // -------------------------------------------------------
        // 1. RTT — this is what the water shader samples each frame
        // -------------------------------------------------------
        this.displacementTexture = new RenderTargetTexture(
            "hkt",
            { width: N, height: N },
            scene,
            {
                generateMipMaps: false,
                type: Constants.TEXTURETYPE_FLOAT,
                format: Constants.TEXTUREFORMAT_RGBA,
                samplingMode: Constants.TEXTURE_NEAREST_SAMPLINGMODE,
            }
        );
        scene.customRenderTargets.push(this.displacementTexture);

        // -------------------------------------------------------
        // 2. Register the time evolution shader
        // -------------------------------------------------------
        Effect.ShadersStore["timeEvolutionFragmentShader"] = timeEvolutionFrag;

        // EffectRenderer drives a fullscreen quad into whatever RTT
        // you bind — no camera needed, no display output
        this._effectRenderer = new EffectRenderer(engine);

        this._timeEvolutionEffect = new EffectWrapper({
            engine,
            fragmentShader: "timeEvolution",   // ✅ name only — Babylon appends "FragmentShader"
            uniforms: ["time", "N", "L"],
            samplerNames: ["h0Texture"],
            name: "timeEvolution",
        });

        // -------------------------------------------------------
        // 3. Hook into scene: run the pass before each render
        // -------------------------------------------------------
        scene.onBeforeRenderObservable.add(() => {
            this._runTimeEvolutionPass();
        });
    }

    // Called from index.ts each frame to update the time uniform
    update(time: number) {
        this._time = time;
    }

    private _runTimeEvolutionPass() {
        const effect = this._timeEvolutionEffect.effect;
        if (!effect?.isReady()) return;

        // Bind first, then set uniforms
        this._effectRenderer.applyEffectWrapper(this._timeEvolutionEffect);

        effect.setTexture("h0Texture", this._h0Texture);
        effect.setFloat("time", this._time);
        effect.setFloat("N", this._N);
        effect.setFloat("L", this._L);

        this._effectRenderer.draw();
    }
}