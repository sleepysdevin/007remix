export interface Updatable {
  update(dt: number): void;
}

export interface Disposable {
  dispose(): void;
}

export type GameEvent =
  | 'player:damaged'
  | 'player:died'
  | 'enemy:killed'
  | 'weapon:fired'
  | 'weapon:switched'
  | 'objective:completed'
  | 'door:opened'
  | 'pickup:collected'
  | 'level:loaded'
  | 'level:completed';

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}
