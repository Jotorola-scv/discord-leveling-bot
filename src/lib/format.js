const FILLED = '█';
const EMPTY = '░';

export function progressBar(ratio, width = 18) {
  const r = Math.min(1, Math.max(0, ratio));
  const filled = Math.round(r * width);
  return FILLED.repeat(filled) + EMPTY.repeat(width - filled);
}

export function num(n) {
  return Math.round(n).toLocaleString('en-US');
}

/** 公告模板變數：{user} {username} {level} {old_level} {xp} {rank} */
export function renderTemplate(template, vars) {
  return String(template).replace(/\{(\w+)\}/g, (match, key) =>
    Object.prototype.hasOwnProperty.call(vars, key) ? String(vars[key]) : match
  );
}
