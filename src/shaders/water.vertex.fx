precision highp float;

attribute vec3 position;
uniform mat4 worldViewProjection;
uniform float time;
uniform vec3 clickPos;
uniform float waveTime;

varying float vHeight;

void main() {
  vec3 p = position;

  float wave =
      sin(p.x * 0.2 + time) * 0.5 +
      sin(p.z * 0.3 + time * 1.2) * 0.3;

  p.y = wave;

  float dist = distance(p.xz, clickPos.xz);
  float age = time - waveTime;
    
  float ripple = 0.0;
    if (age > 0.0 && age < 3.0 && dist < 15.0) {
        float speed = 6.0;
        float waveFront = age * speed;
        
        float thickness = 5.0;
        float mask = smoothstep(waveFront - thickness, waveFront, dist) * 
                     (1.0 - smoothstep(waveFront, waveFront + 0.2, dist));
        
        float amplitude = 1.5 * exp(-age * 1.5);
        ripple = sin((dist - waveFront) * 2.0) * amplitude * mask;
    }

    p.y += ripple;
    vHeight = p.y;

  gl_Position = worldViewProjection * vec4(p, 1.0);
}