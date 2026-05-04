// config.ts — single source of truth for all ocean parameters
export const OceanConfig = {
    fft: {
    N: 64,              // Increased for detail
    L: 200,               // Slightly larger tile to let waves "breathe"
    windSpeed: 8,        // Lowered to reduce "popcorn" chaos
    windDirX: 1.0,
    windDirZ: 0.2,       // Added a tiny bit of Z to break the "perfect row" look
    amplitude: 10.0,      // SIGNIFICANTLY lower (Phillips energy scale)
    displacementScale: 2.0, // Lowered to keep it from spiking
},
    ripple: {
        speed: 2.0,             // m/s
        frequency: 0.8,         // cycles/m
        amplitude: 2.0,         // metres
        decayRate: 0.6,         // per second
        maxAge: 8.0,            // seconds
    },
};