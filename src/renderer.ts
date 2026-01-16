/**
 * Donut Renderer - Classic donut.c algorithm
 */

// Torus geometry
const R1 = 1;   // Tube radius
const R2 = 2;   // Torus radius
const K2 = 5;   // Distance from viewer

// Sampling density
const THETA_SPACING = 0.07;
const PHI_SPACING = 0.02;

// Luminance characters (dark → bright)
const LUMINANCE_CHARS = '.,-~:;=!*#$@';

// Terminal characters are ~2x taller than wide
const CHAR_ASPECT_RATIO = 2.0;

export function renderFrame(
  A: number,
  B: number,
  screenWidth: number,
  screenHeight: number
): string {
  // Scale to fit screen, accounting for character aspect ratio
  // Characters are ~2x taller than wide, so we scale Y differently
  const K1x = screenWidth * K2 * 2 / (8 * (R1 + R2));
  const K1y = K1x / CHAR_ASPECT_RATIO;

  const bufferSize = screenWidth * screenHeight;
  const output: string[] = new Array(bufferSize).fill(' ');
  const zbuffer: number[] = new Array(bufferSize).fill(0);

  const cosA = Math.cos(A);
  const sinA = Math.sin(A);
  const cosB = Math.cos(B);
  const sinB = Math.sin(B);

  for (let theta = 0; theta < 2 * Math.PI; theta += THETA_SPACING) {
    const cosTheta = Math.cos(theta);
    const sinTheta = Math.sin(theta);

    for (let phi = 0; phi < 2 * Math.PI; phi += PHI_SPACING) {
      const cosPhi = Math.cos(phi);
      const sinPhi = Math.sin(phi);

      const circleX = R2 + R1 * cosTheta;
      const circleY = R1 * sinTheta;

      const x = circleX * (cosB * cosPhi + sinA * sinB * sinPhi)
              - circleY * cosA * sinB;
      const y = circleX * (sinB * cosPhi - sinA * cosB * sinPhi)
              + circleY * cosA * cosB;
      const z = K2 + cosA * circleX * sinPhi + circleY * sinA;

      const ooz = 1 / z;

      // Project with different scales for X and Y
      const xp = Math.floor(screenWidth / 2 + K1x * ooz * x);
      const yp = Math.floor(screenHeight / 2 - K1y * ooz * y);

      const L = cosPhi * cosTheta * sinB
              - cosA * cosTheta * sinPhi
              - sinA * sinTheta
              + cosB * (cosA * sinTheta - cosTheta * sinA * sinPhi);

      if (L > 0) {
        const idx = xp + screenWidth * yp;
        if (xp >= 0 && xp < screenWidth && yp >= 0 && yp < screenHeight) {
          if (ooz > zbuffer[idx]) {
            zbuffer[idx] = ooz;
            const luminanceIndex = Math.floor(L * 8);
            output[idx] = LUMINANCE_CHARS[Math.min(luminanceIndex, LUMINANCE_CHARS.length - 1)];
          }
        }
      }
    }
  }

  let result = '';
  for (let j = 0; j < screenHeight; j++) {
    for (let i = 0; i < screenWidth; i++) {
      result += output[i + screenWidth * j];
    }
    result += '\n';
  }

  return result;
}
