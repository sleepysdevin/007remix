export class Random {
  constructor(private rng: () => number) {}

  float(min: number, max: number): number {
    return this.rng() * (max - min) + min;
  }

  int(min: number, max: number): number {
    const lo = Math.min(min, max);
    const hi = Math.max(min, max);
    return Math.floor(this.rng() * (hi - lo + 1)) + lo;
  }

  pick<T>(arr: readonly T[]): T {
    return arr[Math.floor(this.rng() * arr.length)];
  }

  chance(probability: number): boolean {
    return this.rng() < probability;
  }

  shuffle<T>(arr: T[]): void {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(this.rng() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
  }

  /**
   * Selects a random index from an array based on weights
   * @param weights Array of weights (higher = more likely to be selected)
   * @returns The selected index
   */
  weightedPick(weights: number[]): number {
    const totalWeight = weights.reduce((sum, weight) => sum + weight, 0);
    const random = this.rng() * totalWeight;
    
    let weightSum = 0;
    for (let i = 0; i < weights.length; i++) {
      weightSum += weights[i];
      if (random <= weightSum) {
        return i;
      }
    }
    
    // Fallback in case of floating point precision issues
    return weights.length - 1;
  }
}

export function createRNG(seed?: number): () => number {
  if (seed === undefined) return Math.random;
  
  // Simple LCG (Linear Congruential Generator)
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 0xffffffff;
  };
}
