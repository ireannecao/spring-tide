precision highp float;

attribute vec3 position;
uniform mat4 worldViewProjection;
uniform float time;

uniform float maxAge;
uniform float speed;
uniform float padding;
uniform vec3 clickPos;
uniform float waveTime;

varying float vHeight;

void main() {
  vec3 p = position;

  float wave =
      sin(p.x * 0.2 + time) * 0.5 +
      sin(p.z * 0.3 + time * 1.2) * 0.3;

  p.y = wave;
    
  float ripple = 0.0;

  if (waveTime >= 0.0) {
    float age = time - waveTime;

    if (age > 0.0 && age <= maxAge) {
      float dist = distance(p.xz, clickPos.xz);
      float maxRadius = maxAge * speed + padding;

      if (dist <= maxRadius) {
        float waveFront = age * speed;
        float thickness = 5.0;

        float mask = smoothstep(waveFront - thickness, waveFront, dist) * 
                      (1.0 - smoothstep(waveFront, waveFront + 0.2, dist));
        
        float amplitude = 1.5 * exp(-age * 1.5);
        ripple = sin((dist - waveFront) * 2.0) * amplitude * mask;
      }
    }
  }

  p.y += ripple;
  vHeight = p.y;

  gl_Position = worldViewProjection * vec4(p, 1.0);
}