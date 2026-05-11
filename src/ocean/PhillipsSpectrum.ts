/* PhillipsSpectrum.ts computes the initial distribution of ocean wave energy in the frequency domain.
 * Given the grid size, world-space tile size, wind speed, the wind direction, and the amplitude we calculate the following:
 *  Lp (L_phillips), the largest possible wave height that the wind speed can support.
 *  P_h(k) the average wave height for a given wave component
 *   this takes into account things like high frequency ripples having less energy than large waves 
 *   and waves perpendicular to the wind being unable to support themselves
 *  Gaussian noise to add to P_h(k) so that waves at the same frequency are a little different
 * 
 * The output is a N * N * 4 grid where the 4 represents the real and imaginary components for the complex amplitude
 * of wave vectors k and -k
*/


const TWO_PI = 2.0 * Math.PI;

function gaussianRandom(): [number, number] {
    const u = Math.random(), v = Math.random();
    const mag = Math.sqrt(-2 * Math.log(u));
    return [mag * Math.cos(TWO_PI * v), mag * Math.sin(TWO_PI * v)];
}

export interface SpectrumConfig {
    N: number;           // grid size
    L: number;           // world-space tile size
    windSpeed: number;   // m/s
    windDirX: number;    // normalized wind direction X
    windDirZ: number;    // normalized wind direction Z
    amplitude: number;   // overall scale
    spreadExponent: number;
    spreadBlend: number;
}

export function generatePhillipsSpectrum(cfg: SpectrumConfig): Float32Array {
    const { N, L, windSpeed, windDirX, windDirZ, amplitude, spreadExponent, spreadBlend } = cfg;
    const g = 9.81;

    const windLen = Math.sqrt(
        windDirX * windDirX +
        windDirZ * windDirZ
    );

    const wx = windDirX / windLen;
    const wz = windDirZ / windLen;

    // L_phillips: largest possible wave 
    const windSpeedSq = windSpeed * windSpeed;
    const Lp = windSpeedSq / g;

    const data = new Float32Array(N * N * 4);

    // iterate over grid of frequencies
    for (let n = 0; n < N; n++) {
        for (let m = 0; m < N; m++) {
            // equation 36
            const kx = (TWO_PI / L) * (m - N / 2);
            const kz = (TWO_PI / L) * (n - N / 2);
            // wave number: small = large waves, large k = high frequency ripplea
            const kLen = Math.sqrt(kx * kx + kz * kz);

            const idx = (n * N + m) * 4;

            if (kLen < 0.0001) {
                // DC component — zero it out
                data[idx + 0] = 0;
                data[idx + 1] = 0;
                data[idx + 2] = 0;
                data[idx + 3] = 0;
                continue;
            }

            const kxNorm = kx / kLen;
            const kzNorm = kz / kLen;

            const alignment =
                kxNorm * wx +
                kzNorm * wz;

            // Phillips spectrum: Ph(k) in equation 40
            const kLenSq = kLen * kLen;
            const kLenFour = kLenSq * kLenSq;
            const LpSq = Lp * Lp;

            const swellFactor =
                Math.exp(-1.0 / (kLen * Lp));

            const localSpreadExponent =
                2.0 +
                cfg.spreadExponent * swellFactor;

            const directionalSpread =
                Math.pow(
                    Math.abs(alignment),
                    localSpreadExponent
                );

            const spread =
                (1.0 - cfg.spreadBlend) +
                directionalSpread * cfg.spreadBlend;

            const smallWaveDamping = 0.02;

            const lowCutoff =
                Math.exp(-kLenSq * smallWaveDamping * smallWaveDamping);

            const highCutoff =
                Math.exp(-1.0 / (kLenSq * LpSq));

            const againstWindSuppression =
                alignment < 0.0 ? 0.25 : 1.0;

            const capillarySuppress =
                Math.exp(-kLenSq * kLenSq * 0.00002);

            const Ph = amplitude
                * Math.exp(-1.0 / (kLenSq * LpSq))
                * lowCutoff
                * highCutoff
                / kLenFour
                * spread
                * againstWindSuppression
                * capillarySuppress;

            const sqrtPh = Math.sqrt(Math.max(Ph, 0));

            // complex fourier amplitude h_0(k) via Gaussian random numbers in equation 42
            const [g1r, g1i] = gaussianRandom();
            const h0k_r = (1 / Math.SQRT2) * g1r * sqrtPh;
            const h0k_i = (1 / Math.SQRT2) * g1i * sqrtPh;

            // h_0(-k) w new gaussian
            const [g2r, g2i] = gaussianRandom();
            const h0mk_r = (1 / Math.SQRT2) * g2r * sqrtPh;
            const h0mk_i = -(1 / Math.SQRT2) * g2i * sqrtPh;

            // pack the real components at 
            data[idx + 0] = h0k_r;
            data[idx + 1] = h0k_i;
            data[idx + 2] = h0mk_r;
            data[idx + 3] = h0mk_i;
        }
    }

    return data;
}