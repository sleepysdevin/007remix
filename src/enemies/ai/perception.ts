import * as THREE from 'three';
import { PhysicsWorld } from '../../core/physics-world';
import type { EnemyBase } from '../enemy-base';

const FOV_HALF_ANGLE = Math.PI / 3; // 60 degrees each side = 120 degree cone
const SIGHT_RANGE = 20;
const HEARING_GUNSHOT_RANGE = 25;
const HEARING_FOOTSTEP_RANGE = 5;

export interface PerceptionResult {
  canSeePlayer: boolean;
  canHearPlayer: boolean;
  distanceToPlayer: number;
  directionToPlayer: THREE.Vector3;
}

/**
 * Checks whether an enemy can see or hear the player.
 * Uses Rapier raycasting for line-of-sight and distance for hearing.
 */
export function perceivePlayer(
  enemy: EnemyBase,
  playerPos: THREE.Vector3,
  playerCollider: unknown,
  physics: PhysicsWorld,
  playerIsMoving: boolean,
  playerFiredRecently: boolean,
): PerceptionResult {
  const enemyPos = enemy.getHeadPosition();
  const toPlayer = new THREE.Vector3().subVectors(playerPos, enemyPos);
  const distance = toPlayer.length();
  const directionToPlayer = toPlayer.clone().normalize();

  let canSeePlayer = false;
  let canHearPlayer = false;

  // --- Line of sight ---
  if (distance <= SIGHT_RANGE) {
    // Check if player is within FOV cone
    const enemyForward = enemy.getForwardDirection();
    const angle = enemyForward.angleTo(directionToPlayer);

    if (angle <= FOV_HALF_ANGLE) {
      // Raycast to check for walls between enemy and player
      const hit = physics.castRay(
        enemyPos.x, enemyPos.y, enemyPos.z,
        directionToPlayer.x, directionToPlayer.y, directionToPlayer.z,
        distance + 0.5,
      );

      if (hit) {
        // If the ray traveled close to the player distance, nothing is blocking
        const hitDist = hit.toi;
        if (hitDist >= distance - 0.5) {
          canSeePlayer = true;
        }
      } else {
        // No hit means nothing in the way (unlikely in enclosed space)
        canSeePlayer = true;
      }
    }
  }

  // --- Hearing ---
  if (playerFiredRecently && distance <= HEARING_GUNSHOT_RANGE) {
    canHearPlayer = true;
  } else if (playerIsMoving && distance <= HEARING_FOOTSTEP_RANGE) {
    canHearPlayer = true;
  }

  return {
    canSeePlayer,
    canHearPlayer,
    distanceToPlayer: distance,
    directionToPlayer,
  };
}
