import type { LevelSchema } from './level-schema';

/**
 * Load level JSON from URL (e.g. /levels/facility.json).
 */
export async function loadLevel(url: string): Promise<LevelSchema> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to load level: ${res.status} ${res.statusText}`);
  const data = await res.json() as LevelSchema;

  // Basic validation
  if (!data.name || !Array.isArray(data.rooms) || !data.playerSpawn) {
    throw new Error('Invalid level schema: missing name, rooms, or playerSpawn');
  }

  return data;
}
