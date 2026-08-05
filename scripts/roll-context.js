import { ROLL_SUBMISSION_TIMEOUT_MS } from "./constants.js";
import { normalizeKey } from "./utils.js";

const pendingByUser = new Map();
const MAX_PENDING_PER_USER = 10;

/**
 * Queues normalized context for a pending native roll submission.
 */
export function setPendingRollContext(context) {
  const userId = context?.userId ?? globalThis.game?.user?.id ?? "anonymous";
  const queue = pendingByUser.get(userId) ?? [];
  const entry = {
    ...context,
    nonce: context?.nonce ?? randomId(),
    userId,
    createdAt: Date.now()
  };
  queue.push(entry);
  prune(queue);
  while (queue.length > MAX_PENDING_PER_USER) queue.shift();
  pendingByUser.set(userId, queue);
  return entry.nonce;
}

/**
 * Consumes the best metadata-matched pending context for a roll message.
 */
export function consumePendingRollContext(metadata = {}) {
  const key = metadata.userId ?? globalThis.game?.user?.id ?? "anonymous";
  const queue = pendingByUser.get(key);
  if (!queue?.length) return null;
  prune(queue);
  if (!queue.length) {
    pendingByUser.delete(key);
    return null;
  }

  const candidates = matchingCandidates(queue, metadata);
  if (!candidates.length) return null;

  let best = candidates[0];
  let bestScore = scoreContext(queue[best], metadata);
  for (const index of candidates.slice(1)) {
    const score = scoreContext(queue[index], metadata);
    if (score > bestScore) {
      best = index;
      bestScore = score;
    }
  }

  const [context] = queue.splice(best, 1);
  if (!queue.length) pendingByUser.delete(key);
  return context ?? null;
}

/**
 * Discards one pending context by nonce.
 */
export function discardPendingRollContext(nonce, userId = globalThis.game?.user?.id ?? "anonymous") {
  if (!nonce) return;
  const queue = pendingByUser.get(userId);
  if (!queue) return;
  const index = queue.findIndex((entry) => entry.nonce === nonce);
  if (index >= 0) queue.splice(index, 1);
  if (!queue.length) pendingByUser.delete(userId);
}

/**
 * Removes expired pending roll contexts for every user.
 */
export function clearExpiredRollContexts() {
  for (const [userId, queue] of pendingByUser) {
    prune(queue);
    if (!queue.length) pendingByUser.delete(userId);
  }
}

/**
 * Scores how closely a pending context matches roll message metadata.
 */
export function scorePendingContext(context, metadata = {}) {
  return scoreContext(context, metadata);
}

/**
 * Narrows pending contexts by the strongest available actor or token identity.
 */
function matchingCandidates(queue, metadata) {
  const indexes = queue.map((_entry, index) => index);

  if (metadata.tokenId) {
    const exactSceneToken = indexes.filter((index) => {
      const context = queue[index];
      return sameValue(context.tokenId, metadata.tokenId)
        && context.sceneId
        && metadata.sceneId
        && sameValue(context.sceneId, metadata.sceneId);
    });
    if (exactSceneToken.length) return exactSceneToken;

    const exactToken = indexes.filter((index) => {
      const context = queue[index];
      if (!sameValue(context.tokenId, metadata.tokenId)) return false;
      return !context.sceneId || !metadata.sceneId || sameValue(context.sceneId, metadata.sceneId);
    });
    if (exactToken.length) return exactToken;
  }

  if (metadata.actorId) {
    const exactActor = indexes.filter((index) => {
      const context = queue[index];
      if (!sameValue(context.actorId, metadata.actorId)) return false;
      // When the message identifies a token, never consume a context bound to
      // a different token merely because both tokens share the same base Actor.
      return !metadata.tokenId || !context.tokenId;
    });
    if (exactActor.length) return exactActor;
  }

  return indexes.filter((index) => !queue[index].actorId && !queue[index].tokenId);
}

/**
 * Scores secondary roll metadata after identity-based candidate narrowing.
 */
function scoreContext(context, metadata) {
  let score = 0;
  score += compareField(context.actorId, metadata.actorId, 100, -100);
  score += compareField(context.tokenId, metadata.tokenId, 35, -12);
  score += compareField(context.sceneId, metadata.sceneId, 20, -8);
  score += compareField(context.itemId, metadata.itemId, 30, -15);
  score += compareField(context.rollType, metadata.rollType, 22, -6);
  score += compareField(context.skillKey, metadata.skillKey, 18, -4);
  score += compareField(context.selectedAttribute, metadata.attribute, 18, -5);
  score += compareField(context.title, metadata.title, 10, -2);
  return score;
}

function compareField(left, right, match, mismatch) {
  if (left == null || left === "" || right == null || right === "") return 0;
  return sameValue(left, right) ? match : mismatch;
}

function sameValue(left, right) {
  const a = comparableValues(left);
  const b = comparableValues(right);
  return a.some((value) => b.includes(value));
}

function comparableValues(value) {
  const values = Array.isArray(value) ? value : [value];
  return values
    .flatMap((entry) => typeof entry === "string" ? entry.split(",") : [entry])
    .map(normalizeKey)
    .filter(Boolean);
}

function prune(queue) {
  const cutoff = Date.now() - ROLL_SUBMISSION_TIMEOUT_MS;
  while (queue.length && queue[0].createdAt < cutoff) queue.shift();
}

function randomId() {
  if (globalThis.foundry?.utils?.randomID) return foundry.utils.randomID();
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}
