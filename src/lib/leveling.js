// MEE6 等級公式。規格見 Handoff 第 5.2 節 —— 不要憑感覺改。

/** 從 level 升到 level+1 所需 XP */
export function xpForNext(level) {
  return 5 * level * level + 50 * level + 100;
}

/** 達到 level 所需的「總累計 XP」= Σ xpForNext(i), i = 0..level-1（閉式解，別手抄近似值） */
export function totalXpForLevel(level) {
  const L = Math.max(0, Math.floor(level));
  if (L === 0) return 0;
  return ((5 * (L - 1) * L * (2 * L - 1)) / 6) + ((50 * (L - 1) * L) / 2) + (100 * L);
}

/** 由總累計 XP 反推等級（資料庫以 total_xp 為準，level 只是冗餘快取） */
export function levelFromTotalXp(totalXp) {
  const xp = Math.max(0, Math.floor(totalXp));
  let level = 0;
  while (totalXpForLevel(level + 1) <= xp) level++;
  return level;
}

/** 本級進度：等級、本級起點、本級需求、已累積、還差多少 */
export function progressOf(totalXp) {
  const xp = Math.max(0, Math.floor(totalXp));
  const level = levelFromTotalXp(xp);
  const base = totalXpForLevel(level);
  const need = xpForNext(level);
  const into = xp - base;
  return { level, base, need, into, remaining: need - into, ratio: need > 0 ? into / need : 0 };
}
