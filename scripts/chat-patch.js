import { consumePendingRollContext } from "./roll-context.js";

/**
 * Confirms a pending dialog submission when Forbidden Lands creates the
 * matching roll message. The chat card itself is intentionally untouched.
 */
export function attachRollContextFlag(message, data, _options, userId) {
  const currentUserId = globalThis.game?.user?.id;
  if (currentUserId && userId && userId !== currentUserId) return;
  if (!isRollMessage(message, data)) return;

  const metadata = extractRollMessageMetadata(message, data, userId ?? currentUserId);
  const context = consumePendingRollContext(metadata);
  if (!context) return;

  const result = {
    nonce: context.nonce ?? null,
    userId: context.userId ?? metadata.userId ?? null,
    actorId: context.actorId ?? metadata.actorId ?? null,
    message,
    metadata,
    context
  };
  globalThis.Hooks?.callAll?.("fblRollDialogPlusContextConsumed", result);
  globalThis.Hooks?.callAll?.("fblRollDialogPlusRollSubmitted", result);
}

export function extractRollMessageMetadata(message, data, userId = null) {
  const roll = data?.rolls?.[0] ?? message?.rolls?.[0] ?? data?.roll ?? message?.roll ?? null;
  const options = roll?.options ?? roll?._options ?? data?.rollOptions ?? {};
  const speaker = data?.speaker ?? message?.speaker ?? {};
  return {
    userId,
    actorId: speaker.actor ?? options.actorId ?? null,
    tokenId: speaker.token ?? options.tokenId ?? null,
    sceneId: speaker.scene ?? options.sceneId ?? null,
    itemId: options.itemId ?? options.item ?? null,
    rollType: options.type ?? options.mishapType ?? null,
    skillKey: options.skillKey ?? options.skill ?? null,
    attribute: options.attribute ?? null,
    title: options.title ?? options.name ?? data?.flavor ?? message?.flavor ?? null
  };
}

function isRollMessage(message, data) {
  const rollType = globalThis.CONST?.CHAT_MESSAGE_TYPES?.ROLL;
  if ((data?.rolls?.length ?? 0) > 0 || (message?.rolls?.length ?? 0) > 0) return true;
  if (data?.roll || message?.roll) return true;
  if (rollType != null && (data?.type === rollType || message?.type === rollType)) return true;
  if (message?.isRoll === true) return true;
  const content = String(data?.content ?? message?.content ?? "");
  return /dice-roll|dice-tooltip|yzur|yearzero/i.test(content);
}
