import { Scene } from "@babylonjs/core/scene";
import { RenderTargetTexture } from "@babylonjs/core/Materials/Textures/renderTargetTexture";
import { Constants } from "@babylonjs/core/Engines/constants";
import { EffectRenderer, EffectWrapper } from "@babylonjs/core/Materials/effectRenderer";
import { ShaderLanguage, Vector2 } from "@babylonjs/core";
import { Texture } from "@babylonjs/core/Materials/Textures/texture";
import foam from "../shaders/foam.fragment.fx";

const getShaderSource = (s: any) => typeof s === "string" ? s : s.default || "";

function makeRTT(name: string, N: number, scene: Scene): RenderTargetTexture {
    return new RenderTargetTexture(name, { width: N, height: N }, scene, {
        generateMipMaps: false,
        type: Constants.TEXTURETYPE_FLOAT,
        format: Constants.TEXTUREFORMAT_RGBA,
        samplingMode: Constants.TEXTURE_LINEAR_LINEAR,
    });
}

export class FoamPass {
    public foamTexture: RenderTargetTexture;  // current output, read by water shader
    private _current: RenderTargetTexture;
    private _previous: RenderTargetTexture;
    private _renderer: EffectRenderer;
    private _effect: EffectWrapper;
    private _displacementYDx: Texture;
    private _displacementDz: Texture;
    private _N: number;

    constructor(
        scene: Scene,
        N: number,
        displacementYDx: Texture,
        displacementDz: Texture,
        autoRun: boolean = true
    ) {
        const engine = scene.getEngine();
        const src = getShaderSource(foam);

        this._renderer = new EffectRenderer(engine);
        this._current = makeRTT("foam_current", N, scene);
        this._previous = makeRTT("foam_prev", N, scene);

        this.foamTexture = this._current; // exposed output
        // this.foamTexture = makeRTT("foam_current", N, scene);
        // this._prev = makeRTT("foam_prev", N, scene);

        this._displacementYDx = displacementYDx;
        this._displacementDz = displacementDz;
        this._N = N;

        this._effect = new EffectWrapper({
            engine,
            fragmentShader: src,
            uniforms: ["scale", "fadeRate", "foamChoppiness", "N"],
            samplerNames: ["prevFoam", "displacementYDx", "displacementDz"],
            name: "foam",
            shaderLanguage: ShaderLanguage.GLSL,
        });

        this._effect.onApplyObservable.add(() => {
            const e = this._effect.effect;
            e.setVector2("scale", new Vector2(1, 1));
            e.setTexture("prevFoam", this._previous);
            e.setTexture("displacementYDx", displacementYDx);
            e.setTexture("displacementDz", displacementDz);
            e.setFloat("fadeRate", 0.985);   // tune: higher = foam lingers longer
            e.setFloat("foamChoppiness", 8.0);
            e.setFloat("N", N);
        });

        if (autoRun) {
            scene.onBeforeRenderObservable.add(() => this.runPass());
        }
    }

    public runPass() {
        if (!this._effect.effect.isReady()) return;

        // bind PREVIOUS as input
        this._effect.onApplyObservable.clear();
        this._effect.onApplyObservable.add(() => {
            const e = this._effect.effect;

            e.setTexture("prevFoam", this._previous);
            e.setTexture("displacementYDx", this._displacementYDx);
            e.setTexture("displacementDz", this._displacementDz);

            e.setFloat("fadeRate", 0.985);
            e.setFloat("foamChoppiness", 8.0);
            e.setFloat("N", this._N);
        });

        // render into CURRENT
        this._renderer.render(this._effect, this._current);

        // swap AFTER render (correct order)
        const temp = this._previous;
        this._previous = this._current;
        this._current = temp;

        // expose current result
        this.foamTexture = this._current;
    }
}