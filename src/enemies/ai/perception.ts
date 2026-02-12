import * as THREE from 'three';
import type * as RAPIER from '@dimforge/rapier3d-compat';
import { PhysicsWorld } from '../../core/physics-world';
import type { EnemyObject } from '../enemy-manager';

const FOV_HALF_ANGLE = Math.PI / 6; // 60° total
const SIGHT_RANGE = 8;
const HEARING_GUNSHOT_RANGE = 10;
const HEARING_FOOTSTEP_RANGE = 2;

export interface PerceptionResult {
  canSeePlayer: boolean;
  canHearPlayer: boolean;
  distanceToPlayer: number;
  directionToPlayer: THREE.Vector3;
}

export function hasClearLineOfSight(
  physics: PhysicsWorld,
  from: THREE.Vector3,
  to: THREE.Vector3,
  ignoreCollider?: RAPIER.Collider
): boolean {
  const direction = new THREE.Vector3().subVectors(to, from);
  const distance = direction.length();
  if (distance <= 0.001) return true;
  direction.normalize();

  const hit = physics.castRay(
    from.x, from.y, from.z,
    direction.x, direction.y, direction.z,
    distance + 0.25,
    ignoreCollider
  );

  if (!hit) return true;
  return hit.toi >= distance - 0.25;
}

export function perceivePlayer(
  enemy: EnemyObject,
  playerPos: THREE.Vector3,
  playerCollider: RAPIER.Collider,
  physics: PhysicsWorld,
  playerIsMoving: boolean,
  playerFiredRecently: boolean,
): PerceptionResult {
  const enemyPos = enemy.getHeadPosition();
  const toPlayer = new THREE.Vector3().subVectors(playerPos, enemyPos);
  const distance = toPlayer.length();
  const directionToPlayer = distance > 0.001 ? toPlayer.clone().normalize() : new THREE.Vector3(0, 0, 1);

  let canSeePlayer = false;
  let canHearPlayer = false;

  if (distance <= SIGHT_RANGE) {
    const enemyForward = enemy.getForwardDirection();
    const angle = enemyForward.angleTo(directionToPlayer);

    if (angle <= FOV_HALF_ANGLE) {
      canSeePlayer = hasClearLineOfSight(
        physics,
        enemyPos,
        playerPos,
        enemy.collider
      );
    }
  }

  if (playerFiredRecently && distance <= HEARING_GUNSHOT_RANGE) {
    canHearPlayer = true;
  } else if (playerIsMoving && distance <= HEARING_FOOTSTEP_RANGE) {
    canHearPlayer = true;
  }

  // Gameplay rule: enemies should keep pursuing the player continuously.
  if (!canHearPlayer) canHearPlayer = true;

  return {
    canSeePlayer,
    canHearPlayer,
    distanceToPlayer: distance,
    directionToPlayer,
  };
}
