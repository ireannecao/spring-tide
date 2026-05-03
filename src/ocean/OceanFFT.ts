import { Scene } from "@babylonjs/core/scene";
import { RenderTargetTexture } from "@babylonjs/core/Materials/Textures/renderTargetTexture";
import { RawTexture } from "@babylonjs/core/Materials/Textures/rawTexture";
import { Constants } from "@babylonjs/core/Engines/constants";
import { Effect } from "@babylonjs/core/Materials/effect";
import { EffectRenderer, EffectWrapper } from "@babylonjs/core/Materials/effectRenderer";

import timeEvolutionFrag from "../shaders/timeEvolution.fragment.fx";

const getShaderSource = (shader: any): string => {
    return (typeof shader === "string") ? shader : (shader.default || "");
};

export class OceanFFT {
    public displacementTexture: RenderTargetTexture;
    private _effectRenderer: EffectRenderer;
    private _timeEvolutionEffect: EffectWrapper;
    private _h0Texture: RawTexture;
    private _N: number;
    private _L: number;
    private _time: number = 0;

    constructor(scene: Scene, h0Texture: RawTexture, N: number, L: number, autoRun: boolean = true) {
        this._N = N;
        this._L = L;
        this._h0Texture = h0Texture;

        const engine = scene.getEngine();

        const rawShader = (timeEvolutionFrag as any).default || timeEvolutionFrag;
        console.log("TimeEvolution Shader Content Type:", typeof rawShader);
        
        if (typeof rawShader !== "string" || rawShader.length < 10) {
            console.error("FATAL: Shader content is not a valid string. Check Webpack config!");
        }

        // FIX: Extract the raw string from Webpack import
        const shaderContent = (timeEvolutionFrag as any).default || timeEvolutionFrag;
        Effect.ShadersStore["oceanTimeEvolutionFragmentShader"] = shaderContent;

        const shaderSource = getShaderSource(timeEvolutionFrag);

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

        this._effectRenderer = new EffectRenderer(engine);

        this._timeEvolutionEffect = new EffectWrapper({
            engine,
            fragmentShader: shaderSource, // Looks for "oceanTimeEvolutionFragmentShader"
            uniforms: ["time", "N", "L"],
            samplerNames: ["h0Texture"],
            name: "oceanTimeEvolution",
        });

        this._timeEvolutionEffect.onApplyObservable.add(() => {
            const effect = this._timeEvolutionEffect.effect;
            effect.setTexture("h0Texture", this._h0Texture);
            effect.setFloat("time", this._time);
            effect.setFloat("N", this._N);
            effect.setFloat("L", this._L);
        });

        if (autoRun) {
            scene.onBeforeRenderObservable.add(() => this.runPass());
        }
    }

    update(time: number) { this._time = time; }

    public runPass() {
        if (!this._timeEvolutionEffect.effect.isReady()) return;
        this._effectRenderer.render(this._timeEvolutionEffect, this.displacementTexture);
    }
}