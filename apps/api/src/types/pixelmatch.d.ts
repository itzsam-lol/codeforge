declare module "pixelmatch" {
  interface PixelmatchOptions {
    threshold?: number;
    includeAA?: boolean;
    alpha?: number;
    diffColor?: [number, number, number];
  }
  export default function pixelmatch(
    img1: Uint8Array | Uint8ClampedArray | Buffer,
    img2: Uint8Array | Uint8ClampedArray | Buffer,
    output: Uint8Array | Uint8ClampedArray | Buffer | null,
    width: number,
    height: number,
    options?: PixelmatchOptions
  ): number;
}
