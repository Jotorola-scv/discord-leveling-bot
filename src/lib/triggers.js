import { PermissionFlagsBits } from 'discord.js';
import { listTriggers } from './db.js';

export const triggerStats = { fired: 0, onCooldown: 0, failed: 0 };

// 冷卻以「頻道 × 觸發器」為單位，放記憶體即可（重啟最多多貼一次）
const lastFired = new Map();
const key = (channelId, triggerId) => `${channelId}:${triggerId}`;

/** Discord 訊息跳轉連結 */
export const MESSAGE_LINK_RE =
  /^https?:\/\/(?:(?:canary|ptb)\.)?discord(?:app)?\.com\/channels\/(\d+)\/(\d+)\/(\d+)\/?$/;

export function parseMessageLink(url) {
  const m = MESSAGE_LINK_RE.exec(String(url ?? '').trim());
  return m ? { guildId: m[1], channelId: m[2], messageId: m[3] } : null;
}

/** 關鍵字比對：小寫後做子字串比對。中文不受大小寫影響，英文關鍵字才用得到 */
function matches(content, keywordList) {
  const haystack = content.toLowerCase();
  return keywordList.some((k) => haystack.includes(k.toLowerCase()));
}

function buildPayload(trigger) {
  if (trigger.response_type === 'sticker') {
    return { stickers: [trigger.payload] };
  }
  // link：純文字送出，讓 Discord 自己展開訊息預覽。不解析任何 mention。
  const content = [trigger.lead_text, trigger.payload].filter(Boolean).join('\n');
  return { content, allowedMentions: { parse: [] } };
}

/**
 * 訊息命中關鍵字就回應（貼圖或轉發連結）。
 * 跟 XP 系統完全獨立：不受 No-XP 名單、冷卻、延遲入帳影響，也不給或扣 XP。
 */
export async function handleStickerTriggers(message) {
  const guildId = message.guild.id;
  const content = String(message.content ?? '');
  if (!content) return null;

  const triggers = listTriggers(guildId, { onlyEnabled: true });
  if (triggers.length === 0) return null;

  const me = message.guild.members.me;
  if (!message.channel.permissionsFor(me)?.has(PermissionFlagsBits.SendMessages)) return null;

  for (const trigger of triggers) {
    if (!matches(content, trigger.keywordList)) continue;

    const k = key(message.channel.id, trigger.trigger_id);
    const last = lastFired.get(k) ?? 0;
    if (trigger.cooldown_ms > 0 && Date.now() - last < trigger.cooldown_ms) {
      triggerStats.onCooldown++;
      return null;
    }

    lastFired.set(k, Date.now());
    try {
      await message.channel.send(buildPayload(trigger));
      triggerStats.fired++;
      return { triggerId: trigger.trigger_id, type: trigger.response_type, payload: trigger.payload };
    } catch (err) {
      triggerStats.failed++;
      console.warn(`[trigger ${trigger.trigger_id}] ${trigger.response_type} 回應失敗: ${err.message}`);
      return null;
    }
  }
  return null;
}
