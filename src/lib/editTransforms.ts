/** Public Studio values. The server independently validates and normalizes them. */
export type OutputAspect = "9:16" | "1:1" | "16:9";
export type OutputFit = "fit" | "crop";
export type EditTransforms = {
  trim?: { start: number; end: number };
  speed?: 0.5 | 1 | 1.5 | 2 | 3;
  aspect?: OutputAspect;
  fit?: OutputFit;
};
