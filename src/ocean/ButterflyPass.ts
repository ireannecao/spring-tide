import { Scene } from "@babylonjs/core/scene";
import { Engine } from "@babylonjs/core/Engines/engine";
import { RenderTargetTexture } from "@babylonjs/core/Materials/Textures/renderTargetTexture";
import { Texture } from "@babylonjs/core";
import { RawTexture } from "@babylonjs/core/Materials/Textures/rawTexture";
import { Constants } from "@babylonjs/core/Engines/constants";
import { Effect } from "@babylonjs/core/Materials/effect";
import { EffectRenderer, EffectWrapper } from "@babylonjs/core/Materials/effectRenderer";
import butterflyFrag from "../shaders/butterfly.fragment.fx";
import inversionFrag from "../shaders/inversion.fragment.fx";
import { ShaderLanguage, Vector2 } from "@babylonjs/core";

function buildButterflyTexture(N: number, scene: Scene): RawTexture {
    const log2N = Math.log2(N);
    const data = new Float32Array(log2N * N * 4);

    const bitReversed = new Int32Array(N);
    for (let i = 0; i < N; i++) {
        let x = i, rev = 0;
        for (let b = 0; b < log2N; b++) {
            rev = (rev << 1) | (x & 1);
            x >>= 1;
        }
        bitReversed[i] = rev;
    }

    for (let stage = 0; stage < log2N; stage++) {
        const span = 1 << (stage + 1);
        const halfSpan = span >> 1;

        for (let k = 0; k < N; k++) {
            const wing = k % span;
            const isTop = wing < halfSpan;

            const twiddleIdx = (wing % halfSpan) * (N / span);
            var angle = -2.0 * Math.PI * twiddleIdx / N;

            let topIdx: number, bottomIdx: number;
            if (stage === 0) {
                const base = k - (k % span);
                topIdx = bitReversed[base + (isTop ? wing : wing - halfSpan)];
                bottomIdx = bitReversed[base + (isTop ? wing + halfSpan : wing)];
            } else {
                topIdx = isTop ? k : k - halfSpan;
                bottomIdx = isTop ? k + halfSpan : k;
            }

            if (!isTop) {
                angle += Math.PI;
            }

            const idx = (stage * N + k) * 4;
            data[idx + 0] = Math.cos(angle);
            data[idx + 1] = Math.sin(angle);
            data[idx + 2] = topIdx;
            data[idx + 3] = bottomIdx;
        }
    }

    return new RawTexture(
        data,
        log2N,
        N,
        Constants.TEXTUREFORMAT_RGBA,
        scene,
        false, false,
        Constants.TEXTURE_NEAREST_SAMPLINGMODE,
        Engine.TEXTURETYPE_FLOAT
    );
}

function makeRTT(name: string, N: number, scene: Scene): RenderTargetTexture {
    return new RenderTargetTexture(name, { width: N, height: N }, scene, {
        generateMipMaps: false,
        type: Constants.TEXTURETYPE_FLOAT,
        format: Constants.TEXTUREFORMAT_RGBA,
        samplingMode: Constants.TEXTURE_NEAREST_SAMPLINGMODE,
    });
}

const getShader = (shader: any): string => (typeof shader === "string" ? shader : shader.default || "");

const getShaderSource = (shader: any): string => (typeof shader === "string" ? shader : shader.default || "");

export class ButterflyPass {
    public displacementTexture: RenderTargetTexture;
    private _renderer: EffectRenderer;
    private _butterflyEffect: EffectWrapper;
    private _inversionEffect: EffectWrapper;
    private _butterflyLUT: RawTexture;
    private _pingPong: [RenderTargetTexture, RenderTargetTexture];
    private _hktTexture: Texture;
    private _N: number;
    private _log2N: number;

    constructor(scene: Scene, hktTexture: Texture, N: number, passName: string, autoRun: boolean = true) {
        this._N = N;
        this._log2N = Math.log2(N);
        this._hktTexture = hktTexture;
        const engine = scene.getEngine();

        // 1. Get Source Strings
        const bSource = getShaderSource(butterflyFrag);
        const iSource = getShaderSource(inversionFrag);

        this._renderer = new EffectRenderer(engine);
        this._butterflyLUT = buildButterflyTexture(N, scene);
        this._pingPong = [
            makeRTT(`${passName}_pp0`, N, scene),
            makeRTT(`${passName}_pp1`, N, scene)
        ];
        this.displacementTexture = makeRTT(`${passName}_displacement`, N, scene);
        this.displacementTexture.updateSamplingMode(Constants.TEXTURE_LINEAR_LINEAR);

        // 2. Initialize Effects with Direct Source Injection
        this._butterflyEffect = new EffectWrapper({
            engine,
            fragmentShader: bSource,
            uniforms: ["stage", "N", "direction", "pingPong"],
            samplerNames: ["butterflyTexture", "pingPong0", "pingPong1"],
            name: `${passName}_butterfly`,
            shaderLanguage: ShaderLanguage.GLSL,
        });

        this._inversionEffect = new EffectWrapper({
            engine,
            fragmentShader: iSource,
            uniforms: ["N", "scale"],
            samplerNames: ["fftResult"],
            name: `${passName}_inversion`,
            shaderLanguage: ShaderLanguage.GLSL,
        });
        const effect = this._inversionEffect.effect;
        scene.onBeforeRenderObservable.addOnce(() => {
            const vertexSrc = (effect as any)._vertexSourceCode ||
                (effect as any)._processedVertexCode ||
                (effect as any).vertexSourceCode;
            console.log("[Inversion vertex shader]:", vertexSrc?.substring(0, 500));
        });

        if (autoRun) {
            scene.onBeforeRenderObservable.add(() => this.runPass());
        }
    }

    public runPass() { this._runFFT(this._hktTexture); }

    public async getDisplacementData(): Promise<Float32Array> {
        const pixels = await this.displacementTexture.readPixels();
        return new Float32Array(pixels!.buffer);
    }

    private _runFFT(hktTexture: Texture) {
        if (!this._butterflyEffect.effect.isReady() || !this._inversionEffect.effect.isReady()) return;

        let readBuf = 0;
        let writeBuf = 1;
        const N = this._N;

        // ---- Horizontal passes ----
        for (let stage = 0; stage < this._log2N; stage++) {
            const stageVal = stage;
            const sourceForRead = stage === 0 ? hktTexture : this._pingPong[readBuf];
            const dest = this._pingPong[writeBuf];

            this._butterflyEffect.onApplyObservable.clear();
            this._butterflyEffect.onApplyObservable.add(() => {
                const e = this._butterflyEffect.effect;
                e.setVector2("scale", new Vector2(1, 1));
                e.setTexture("butterflyTexture", this._butterflyLUT);
                e.setTexture("pingPong0", sourceForRead);
                e.setTexture("pingPong1", null as any); // BREAK FEEDBACK LOOP
                e.setFloat("stage", stageVal);
                e.setFloat("N", N);
                e.setInt("direction", 0);
                e.setInt("pingPong", 0);
            });

            this._renderer.render(this._butterflyEffect, dest);
            [readBuf, writeBuf] = [writeBuf, readBuf];
        }

        // ---- Vertical passes ----
        for (let stage = 0; stage < this._log2N; stage++) {
            const stageVal = stage;
            const dest = this._pingPong[writeBuf];
            const sourceForRead = this._pingPong[readBuf];

            this._butterflyEffect.onApplyObservable.clear();
            this._butterflyEffect.onApplyObservable.add(() => {
                const e = this._butterflyEffect.effect;
                e.setTexture("butterflyTexture", this._butterflyLUT);
                e.setTexture("pingPong0", sourceForRead);
                e.setTexture("pingPong1", null as any); // BREAK FEEDBACK LOOP
                e.setFloat("stage", stageVal);
                e.setFloat("N", N);
                e.setInt("direction", 1);
                e.setInt("pingPong", 0);
            });

            this._renderer.render(this._butterflyEffect, dest);
            [readBuf, writeBuf] = [writeBuf, readBuf];
        }

        // ---- Inversion pass ----
        const fftResult = this._pingPong[readBuf];
        this._inversionEffect.onApplyObservable.clear();
        this._inversionEffect.onApplyObservable.add(() => {
            const e = this._inversionEffect.effect;
            e.setVector2("scale", new Vector2(1, 1));
            e.setTexture("fftResult", fftResult);
            e.setFloat("N", N);
        });
        this._renderer.render(this._inversionEffect, this.displacementTexture);
    }
}