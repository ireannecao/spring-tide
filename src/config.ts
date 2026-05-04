// config.ts
export const OceanConfig = {
    // FFT ocean
    tileSize: 50,
    gridSize: 64,
    windSpeed: 12,
    windDirX: 1.0,
    windDirZ: 0.0,
    amplitude: 10.0,

    // click ripples
    ripple: {
        speed: 2.0,          // m/s
        frequency: 0.8,      // cycles/m
        amplitude: 2.0,      // meters
        decayRate: 0.6,      // per second
        maxAge: 8.0,         // seconds
    }
};