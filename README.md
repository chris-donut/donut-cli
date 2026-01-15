# Donut CLI 🍩

A spinning ASCII donut animation for your terminal, implemented in TypeScript.

Based on the classic [donut.c](https://www.a1k0n.net/2011/07/20/donut-math.html) by Andy Sloane (2006).

```
                         $@@@@@@@@$#
                     #@@$$$$########**!
                   @$$$$####****!!!!====;
                 #$$$####***!!!!====;;;::~
                #$$####***!!===;;;:::~~--,
               #$$####***!!==;;::~~--,,..
              *$####***!!!==;::~--,,...
              *####****!!==;;:~-,,...
              !***!!!!!!!==;::~-,...
              =!!!!!!!===;;::~-,..
              ;=======;;;::~~-,.
               :;;;;;:::~~--,.
                ~:::::~~--,.
                 -~~~~---,.
                   ,----,.
```

## Installation

```bash
# Clone the repository
git clone https://github.com/your-username/donut-cli.git
cd donut-cli

# Install dependencies
npm install

# Build
npm run build

# Run
npm start
```

## Development

```bash
# Run directly with ts-node (no build step)
npm run dev
```

## How It Works

The donut is rendered using these techniques:

1. **Torus Geometry**: A circle (radius R1) is swept around an axis at distance R2
2. **3D Rotation**: Two rotation matrices spin the torus around X and Z axes
3. **Perspective Projection**: 3D points are projected to 2D using `x' = x*K1/z`
4. **Z-Buffering**: Tracks depth to render only the closest surface at each pixel
5. **Lighting**: Surface normals are dot-producted with light direction for shading
6. **ASCII Mapping**: Luminance values map to characters: `.,-~:;=!*#$@`

## Key Constants

| Constant | Value | Description |
|----------|-------|-------------|
| R1 | 1 | Tube radius |
| R2 | 2 | Torus radius |
| K2 | 5 | Distance from viewer |
| θ spacing | 0.07 | Sampling around tube |
| φ spacing | 0.02 | Sampling around torus |

## Controls

- **Ctrl+C** - Exit the animation
- The animation automatically adapts to terminal resize

## License

MIT

## Credits

- Original donut.c by [Andy Sloane](https://www.a1k0n.net/2011/07/20/donut-math.html)
- TypeScript implementation by Donut CLI contributors
