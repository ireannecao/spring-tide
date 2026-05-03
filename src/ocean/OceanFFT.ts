import { Scene } from "@babylonjs/core/scene";
import { RenderTargetTexture } from "@babylonjs/core/Materials/Textures/renderTargetTexture";
import { RawTexture } from "@babylonjs/core/Materials/Textures/rawTexture";
import { Constants } from "@babylonjs/core/Engines/constants";
import { EffectRenderer, EffectWrapper } from "@babylonjs/core/Materials/effectRenderer";

import timeEvolutionFrag from "../shaders/timeEvolution.fragment.fx";

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
            fragmentShader: timeEvolutionFrag,
            uniforms: ["time", "N", "L"],
            samplerNames: ["h0Texture"],
            name: "timeEvolution",
        });

        // onApplyObservable fires after the program is bound but before the
        // draw call — the only valid window to set uniforms for this program.
        this._timeEvolutionEffect.onApplyObservable.add(() => {
            const effect = this._timeEvolutionEffect.effect;
            effect.setTexture("h0Texture", this._h0Texture);
            effect.setFloat("time", this._time);
            effect.setFloat("N", this._N);
            effect.setFloat("L", this._L);
        });

        this._timeEvolutionEffect.effect.onErrorObservable.add((effect) => {
            console.error("timeEvolution shader compile error:", effect);
        });

        scene.onBeforeRenderObservable.add(() => {
            this._runTimeEvolutionPass();
        });
    }

    update(time: number) {
        this._time = time;
    }

    private _runTimeEvolutionPass() {
        if (!this._timeEvolutionEffect.effect.isReady()) return;

        this._effectRenderer.render(
            this._timeEvolutionEffect,
            this.displacementTexture
        );
    }
}