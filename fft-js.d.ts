declare module "fft-js" {
  export type Complex = [number, number];

  export function fft(signal: number[]): Complex[];

  export const util: {
    fftMag(phasors: Complex[]): number[];
  };
}
