// Small, transport-neutral walking protocol. No vehicle/seat state in Stage 8A.
export const VERSION = 1;
export const MAX_BYTES = 1024;
export const ROOM_RE = /^[A-Za-z0-9_-]{16}$/;
export const PLAYER_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
export const TOKEN_RE = /^[A-Za-z0-9_-]{32}$/;
export const validRoom = value => typeof value === 'string' && ROOM_RE.test(value);
export const validId = value => typeof value === 'string' && PLAYER_RE.test(value);
export const validToken = value => typeof value === 'string' && TOKEN_RE.test(value);
export function exact(value, required, optional = []) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    && required.every(k => Object.hasOwn(value, k))
    && Object.keys(value).every(k => required.includes(k) || optional.includes(k));
}
export function validNickname(value) {
  return typeof value === 'string' && value === value.trim() && [...value].length > 0
    && [...value].length <= 24 && !/\p{C}/u.test(value);
}
export function validPose(p) {
  return exact(p, ['x','y','z','yaw','moving']) && [p.x,p.y,p.z,p.yaw].every(Number.isFinite)
    && p.x >= -90 && p.x <= 90 && p.z >= -130 && p.z <= 60 && p.y >= -1 && p.y <= 3
    && Math.abs(p.yaw) <= Math.PI + .000001 && typeof p.moving === 'boolean';
}
export const validSequence = n => Number.isSafeInteger(n) && n >= 0;
export function validPlayer(p) {
  return exact(p,['playerId','nickname','pose','seq']) && validId(p.playerId)
    && validNickname(p.nickname) && validPose(p.pose) && validSequence(p.seq);
}
export function validPlayers(players) {
  return Array.isArray(players) && players.length <= 2 && players.every(validPlayer)
    && new Set(players.map(p => p.playerId)).size === players.length;
}
