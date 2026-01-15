/**
 * Donut Renderer
 *
 * Implements the classic donut.c algorithm:
 * 1. Generate points on a torus surface by sweeping a circle (θ) around an axis (φ)
 * 2. Apply rotation matrices for animation (A around x-axis, B around z-axis)
 * 3. Project 3D points onto 2D screen with perspective
 * 4. Calculate surface normals for lighting
 * 5. Use z-buffer for proper depth ordering
 * 6. Map luminance to ASCII characters
 */

// Torus geometry constants
const R1 = 1;   // Radius of the tube (cross-section circle)
const R2 = 2;   // Distance from torus center to tube center
const K2 = 5;   // Distance from viewer to torus

// Sampling density - smaller = more detail but slower
const THETA_SPACING = 0.07;  // Around the tube
const PHI_SPACING = 0.02;    // Around the torus center

// Luminance characters from darkest to brightest
// The surface normal dot product ranges from -√2 to +√2
// We only render positive values (facing the light)
const LUMINANCE_CHARS = '.,-~:;=!*#$@';

/**
 * Renders a single frame of the spinning donut
 *
 * @param A - Rotation angle around X axis
 * @param B - Rotation angle around Z axis
 * @param screenWidth - Terminal width in characters
 * @param screenHeight - Terminal height in characters
 * @returns String to output to terminal
 */
export function renderFrame(
  A: number,
  B: number,
  screenWidth: number,
  screenHeight: number
): string {
  // Calculate K1 (scale factor) based on screen size
  // We want the torus to fill about 3/4 of the screen width
  // At z=0, the torus extends from x=-(R1+R2) to x=(R1+R2)
  const K1 = screenWidth * K2 * 3 / (8 * (R1 + R2));

  // Initialize buffers
  const bufferSize = screenWidth * screenHeight;
  const output: string[] = new Array(bufferSize).fill(' ');
  const zbuffer: number[] = new Array(bufferSize).fill(0);

  // Precompute sines and cosines of rotation angles
  const cosA = Math.cos(A);
  const sinA = Math.sin(A);
  const cosB = Math.cos(B);
  const sinB = Math.sin(B);

  // Sweep θ around the tube's cross-sectional circle
  for (let theta = 0; theta < 2 * Math.PI; theta += THETA_SPACING) {
    const cosTheta = Math.cos(theta);
    const sinTheta = Math.sin(theta);

    // Sweep φ around the torus's central axis
    for (let phi = 0; phi < 2 * Math.PI; phi += PHI_SPACING) {
      const cosPhi = Math.cos(phi);
      const sinPhi = Math.sin(phi);

      // Calculate the (x, y) position of the point on the 2D circle
      // before it's revolved around the torus center
      const circleX = R2 + R1 * cosTheta;
      const circleY = R1 * sinTheta;

      // 3D coordinates after all rotations
      // This is the result of multiplying by three rotation matrices:
      // 1. Revolve around Y-axis by φ (creates the torus shape)
      // 2. Rotate around X-axis by A (tilt)
      // 3. Rotate around Z-axis by B (spin)
      const x = circleX * (cosB * cosPhi + sinA * sinB * sinPhi)
              - circleY * cosA * sinB;
      const y = circleX * (sinB * cosPhi - sinA * cosB * sinPhi)
              + circleY * cosA * cosB;
      const z = K2 + cosA * circleX * sinPhi + circleY * sinA;

      // One-over-z for perspective projection and depth buffering
      const ooz = 1 / z;

      // Project to 2D screen coordinates
      // Note: y is negated because screen Y increases downward
      const xp = Math.floor(screenWidth / 2 + K1 * ooz * x);
      const yp = Math.floor(screenHeight / 2 - K1 * ooz * y);

      // Calculate luminance using surface normal dot product with light direction
      // Light direction is (0, 1, -1) - from behind and above the viewer
      // L ranges from -√2 to +√2; we only render if L > 0 (facing the light)
      const L = cosPhi * cosTheta * sinB
              - cosA * cosTheta * sinPhi
              - sinA * sinTheta
              + cosB * (cosA * sinTheta - cosTheta * sinA * sinPhi);

      // Only render if the surface faces the light
      if (L > 0) {
        // Check screen bounds and z-buffer
        const idx = xp + screenWidth * yp;
        if (xp >= 0 && xp < screenWidth && yp >= 0 && yp < screenHeight) {
          // Z-buffer test: larger ooz = closer to viewer
          if (ooz > zbuffer[idx]) {
            zbuffer[idx] = ooz;
            // Map luminance to character (L * 8 gives 0-11 range for √2 max)
            const luminanceIndex = Math.floor(L * 8);
            output[idx] = LUMINANCE_CHARS[Math.min(luminanceIndex, LUMINANCE_CHARS.length - 1)];
          }
        }
      }
    }
  }

  // Convert buffer to string with newlines
  let result = '';
  for (let j = 0; j < screenHeight; j++) {
    for (let i = 0; i < screenWidth; i++) {
      result += output[i + screenWidth * j];
    }
    result += '\n';
  }

  return result;
}
