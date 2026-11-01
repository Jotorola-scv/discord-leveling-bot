import { createHash } from 'node:crypto';

const ZERO_WIDTH = /[​‌‍﻿⁠]/g;
const CUSTOM_EMOJI = /<a?:\w+:\d+>/g;
// Extended_Pictographic + 膚色修飾 + 區域指示符 + ZWJ + VS16 + keycap
const EMOJI_CHARS = /[\p{Extended_Pictographic}\u{1F3FB}-\u{1F3FF}\u{1F1E6}-\u{1F1FF}‍️⃣]/gu;

/** 17.5 正規化：去零寬、連續空白收一、trim、轉小寫 */
export function normalize(raw) {
  return String(raw ?? '')
    .replace(ZERO_WIDTH, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

/** 以「字」計長，不是 UTF-16 code unit */
export function charLength(normalized) {
  return [...normalized].length;
}

/** 17.5 hash = sha256(guildId + userId + normalized) 前 16 hex。只跟該使用者上次成功入帳比 */
export function contentHash(guildId, userId, normalized) {
  return createHash('sha256').update(`${guildId}${userId}${normalized}`).digest('hex').slice(0, 16);
}

/**
 * 沒有實質文字內容：純貼圖、純 emoji（含自訂表情）、或只有附件。
 * 扣掉表情與空白後什麼都不剩就算。
 */
export function hasNoTextSubstance(message) {
  const stripped = String(message.content ?? '')
    .replace(ZERO_WIDTH, '')
    .replace(CUSTOM_EMOJI, '')
    .replace(EMOJI_CHARS, '')
    .replace(/\s+/g, '');
  return stripped.length === 0;
}

// ---------- 18.3 什麼算「圖片或影片」 ----------

const MEDIA_EXT = /\.(png|jpe?g|gif|webp|mp4|webm|mov)$/i;

function isQualifiedAttachment(a) {
  const type = a.contentType ?? '';
  if (type.startsWith('image/') || type.startsWith('video/')) return true;
  // contentType 空時用副檔名備援
  return type === '' && MEDIA_EXT.test(a.name ?? '');
}

/** 18.5 附件指紋：sha256(size + filename + contentType)。不抓檔案內容。 */
function attachmentFingerprint(a) {
  return createHash('sha256')
    .update(`${a.size ?? 0}|${a.name ?? ''}|${a.contentType ?? ''}`)
    .digest('hex')
    .slice(0, 16);
}

/**
 * 本則訊息自己的合格媒體指紋（排序後去重）。
 * 只看 message.attachments —— 回覆裡引用別人的圖不算、外連不算、sticker 不算。
 */
export function qualifiedMediaHashes(message) {
  const attachments = message.attachments ? [...message.attachments.values()] : [];
  const hashes = attachments.filter(isQualifiedAttachment).map(attachmentFingerprint);
  return [...new Set(hashes)].sort();
}

/**
 * 訊息身分 hash：正規化文字 + 合格媒體指紋。
 * 純圖投稿的身分由檔案指紋決定，所以同一人重傳同一檔會被 17.5 的重複規則擋下。
 */
export function messageIdentityHash(guildId, userId, normalized, mediaHashes) {
  const payload = mediaHashes.length > 0 ? `${normalized}\u0000${mediaHashes.join(',')}` : normalized;
  return contentHash(guildId, userId, payload);
}

// ---------- 連結加成 ----------

const URL_RE = /https?:\/\/[^\s<>()[\]"'`]+/gi;

/** 白名單比對：host 完全相同，或是它的子網域（www.pixiv.net 命中 pixiv.net） */
function hostMatches(host, domain) {
  return host === domain || host.endsWith(`.${domain}`);
}

/**
 * 訊息裡命中白名單的網域（去重）。同一則貼三個 pixiv 連結只算一次。
 * 只看訊息文字，不解析 embed —— embed 是 Discord 事後補的，收訊時還不一定有。
 */
export function matchedLinkDomains(message, domains) {
  if (!domains || domains.length === 0) return [];
  const hits = new Set();
  for (const raw of String(message.content ?? '').match(URL_RE) ?? []) {
    let host;
    try {
      host = new URL(raw).hostname.toLowerCase().replace(/^www\./, '');
    } catch {
      continue; // 不是合法 URL 就跳過
    }
    for (const d of domains) if (hostMatches(host, d)) hits.add(d);
  }
  return [...hits];
}
