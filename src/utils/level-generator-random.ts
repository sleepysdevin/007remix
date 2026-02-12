/**
 * Simple deterministic random number generator for level generation
 * Ensures consistent results for the same seed
 */

export class Random {
  private seed: number;

  constructor(seed: number) {
    this.seed = seed % 2147483647;
    if (this.seed <= 0) this.seed += 2147483646;
  }

  /**
   * Generate a random float between min (inclusive) and max (exclusive)
   */
  float(min: number, max: number): number {
    this.seed = (this.seed * 16807) % 2147483647;
    const random = (this.seed - 1) / 2147483646;
    return min + random * (max - min);
  }

  /**
   * Generate a random integer between min (inclusive) and max (inclusive)
   */
  int(min: number, max: number): number {
    return Math.floor(this.float(min, max + 1));
  }

  /**
   * Pick a random element from an array
   */
  pick<T>(array: T[]): T {
    return array[this.int(0, array.length - 1)];
  }

  /**
   * Randomly shuffle an array (in place)
   */
  shuffle<T>(array: T[]): T[] {
    for (let i = array.length - 1; i > 0; i--) {
      const j = this.int(0, i);
      [array[i], array[j]] = [array[j], array[i]];
    }
    return array;
  }

  /**
   * Get a random boolean with the given probability (0-1)
   */
  chance(probability: number): boolean {
    return this.float(0, 1) < probability;
  }
}

/**
 * Create a new random number generator with the given seed
 */
export function createRNG(seed: number | string): Random {
  // If seed is a string, convert it to a number
  const numericSeed = typeof seed === 'string' 
    ? seed.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0)
    : seed;
    
  return new Random(numericSeed);
}
