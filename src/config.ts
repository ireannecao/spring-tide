import { Color3 } from "@babylonjs/core";

// config.ts — single source of truth for all ocean parameters
export const OceanConfig = {
    fft: {
        N: 512,              // Increased for detail
        L: 200,               // Slightly larger tile to let waves "breathe"
        windSpeed: 10,        // Lowered to reduce "popcorn" chaos
        windDirX: 1.0,
        windDirZ: 0.2,       // Added a tiny bit of Z to break the "perfect row" look
        amplitude: 10.0,      // SIGNIFICANTLY lower (Phillips energy scale)
        spreadExponent: 8,
        spreadBlend: 0.85,
        displacementScale: 35.0,
        choppiness: 10.0,
    },
    ripple: {
        speed: 10.0,             // m/s
        frequency: 0.1,         // cycles/m
        amplitude: 1.0,         // metres
        decayRate: 0.5,         // per second
        maxAge: 4.0,            // seconds
    },
    visuals: {
        skyBrightness: 1.0,
        noonColor: new Color3(0.7, 0.85, 1.0),
        sunsetColor: new Color3(1.0, 0.65, 0.2),
        nightColor: new Color3(0.05, 0.05, 0.2),
        moonColor: new Color3(0.6, 0.65, 0.8),
    },
    penguin: {
        size: 8.0,
        submersion: 1.3,
        plopAmplitude: 2.0,
    }
};