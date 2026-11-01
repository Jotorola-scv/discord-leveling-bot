import { SlashCommandBuilder, PermissionFlagsBits, MessageFlags, EmbedBuilder } from 'discord.js';
import {
  listTriggers, addTrigger, removeTrigger,
  setTriggerEnabled, updateTriggerCooldown, updateTriggerKeywords,
} from '../lib/db.js';
import { triggerStats, parseMessageLink } from '../lib/triggers.js';
import { num } from '../lib/format.js';

const KEYWORDS_DESC = '關鍵字，用逗號分隔。例如：美味, 好吃, delicious';

export const data = new SlashCommandBuilder()
  .setName('trigger')
  .setDescription('關鍵字出現時自動回應（貼圖或轉發訊息連結）')
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
  .addSubcommand((s) => s
    .setName('add-sticker').setDescription('關鍵字 → 貼出伺服器貼圖')
    .addStringOption((o) => o.setName('keywords').setDescription(KEYWORDS_DESC).setRequired(true))
    .addStringOption((o) => o.setName('sticker')
      .setDescription('伺服器貼圖（開始打字會跳出清單）').setAutocomplete(true).setRequired(true))
    .addIntegerOption((o) => o.setName('cooldown-seconds')
      .setDescription('同一頻道多久才能再回應一次，預設 60；0 = 不限制')
      .setMinValue(0).setMaxValue(86400)))
  .addSubcommand((s) => s
    .setName('add-link').setDescription('關鍵字 → 轉發一條訊息連結（或任何網址）')
    .addStringOption((o) => o.setName('keywords').setDescription(KEYWORDS_DESC).setRequired(true))
    .addStringOption((o) => o.setName('link')
      .setDescription('右鍵那則訊息 → 複製訊息連結，貼進來').setRequired(true))
    .addStringOption((o) => o.setName('text')
      .setDescription('連結前要附的一句話，可留空。例如：這個你要的圖 👉'))
    .addIntegerOption((o) => o.setName('cooldown-seconds')
      .setDescription('同一頻道多久才能再回應一次，預設 60；0 = 不限制')
      .setMinValue(0).setMaxValue(86400)))
  .addSubcommand((s) => s
    .setName('list').setDescription('列出目前所有觸發'))
  .addSubcommand((s) => s
    .setName('keywords').setDescription('改某組的關鍵字（不動回應內容與冷卻）')
    .addIntegerOption((o) => o.setName('id').setDescription('編號（看 list）').setMinValue(1).setRequired(true))
    .addStringOption((o) => o.setName('value').setDescription('關鍵字，用逗號分隔').setRequired(true))
    .addStringOption((o) => o.setName('mode').setDescription('怎麼套用，預設整組取代').addChoices(
      { name: '整組取代（預設）', value: 'replace' },
      { name: '加進現有清單', value: 'add' },
      { name: '從清單移除', value: 'remove' },
    )))
  .addSubcommand((s) => s
    .setName('cooldown').setDescription('改某組的冷卻秒數')
    .addIntegerOption((o) => o.setName('id').setDescription('編號').setMinValue(1).setRequired(true))
    .addIntegerOption((o) => o.setName('seconds').setDescription('0 = 不限制')
      .setMinValue(0).setMaxValue(86400).setRequired(true)))
  .addSubcommand((s) => s
    .setName('toggle').setDescription('暫時停用／恢復一組觸發')
    .addIntegerOption((o) => o.setName('id').setDescription('編號').setMinValue(1).setRequired(true))
    .addBooleanOption((o) => o.setName('enabled').setDescription('true = 啟用').setRequired(true)))
  .addSubcommand((s) => s
    .setName('remove').setDescription('刪除一組觸發')
    .addIntegerOption((o) => o.setName('id').setDescription('編號').setMinValue(1).setRequired(true)));

/** sticker 選項的自動完成：列出這個伺服器的貼圖 */
export async function autocomplete(interaction) {
  const typed = interaction.options.getFocused().toLowerCase();
  const stickers = await interaction.guild.stickers.fetch().catch(() => null);
  if (!stickers) return interaction.respond([]);

  const choices = [...stickers.values()]
    .filter((s) => !typed || s.name.toLowerCase().includes(typed))
    .slice(0, 25)
    .map((s) => ({ name: s.description ? `${s.name} — ${s.description}`.slice(0, 100) : s.name, value: s.id }));
  return interaction.respond(choices);
}

export async function execute(interaction) {
  const guildId = interaction.guildId;

  switch (interaction.options.getSubcommand()) {
    case 'add-sticker': return addSticker(interaction, guildId);
    case 'add-link': return addLink(interaction, guildId);
    case 'list': return listAll(interaction, guildId);
    case 'keywords': return editKeywords(interaction, guildId);

    case 'cooldown': {
      const id = interaction.options.getInteger('id');
      const seconds = interaction.options.getInteger('seconds');
      return reply(interaction, updateTriggerCooldown(guildId, id, seconds * 1000)
        ? `✅ 觸發 #${id} 的冷卻設為 ${seconds ? `${seconds} 秒` : '不限制 ⚠️'}。`
        : `找不到觸發 #${id}。`);
    }

    case 'toggle': {
      const id = interaction.options.getInteger('id');
      const enabled = interaction.options.getBoolean('enabled');
      return reply(interaction, setTriggerEnabled(guildId, id, enabled)
        ? `✅ 觸發 #${id} 已${enabled ? '啟用' : '停用'}。`
        : `找不到觸發 #${id}。`);
    }

    case 'remove': {
      const id = interaction.options.getInteger('id');
      return reply(interaction, removeTrigger(guildId, id)
        ? `✅ 已刪除觸發 #${id}。`
        : `找不到觸發 #${id}。`);
    }

    default:
      return reply(interaction, '未知的子指令。');
  }
}

function parseKeywords(raw) {
  return [...new Set(String(raw).split(/[,，]/).map((k) => k.trim()).filter(Boolean))];
}

async function addSticker(interaction, guildId) {
  const keywords = parseKeywords(interaction.options.getString('keywords'));
  if (keywords.length === 0) return reply(interaction, '⚠️ 至少要一個關鍵字。');

  const input = interaction.options.getString('sticker');
  const cooldownMs = (interaction.options.getInteger('cooldown-seconds') ?? 60) * 1000;

  const stickers = await interaction.guild.stickers.fetch().catch(() => null);
  const sticker = stickers?.get(input)
    ?? [...(stickers?.values() ?? [])].find((s) => s.name.toLowerCase() === input.toLowerCase());
  if (!sticker) {
    return reply(interaction,
      `⚠️ 在這個伺服器找不到貼圖 \`${input}\`。請從自動完成的清單選，或貼上貼圖 ID。`);
  }

  const id = addTrigger(guildId, {
    keywords, responseType: 'sticker', payload: sticker.id, cooldownMs,
  });
  return reply(interaction, [
    `✅ 已新增觸發 **#${id}**（貼圖）`,
    `關鍵字：${keywords.map((k) => `\`${k}\``).join('、')}`,
    `貼圖：**${sticker.name}**`,
    describeCooldown(cooldownMs),
  ].join('\n'));
}

async function addLink(interaction, guildId) {
  const keywords = parseKeywords(interaction.options.getString('keywords'));
  if (keywords.length === 0) return reply(interaction, '⚠️ 至少要一個關鍵字。');

  const link = interaction.options.getString('link').trim();
  const leadText = interaction.options.getString('text')?.trim() || null;
  const cooldownMs = (interaction.options.getInteger('cooldown-seconds') ?? 60) * 1000;

  if (!/^https?:\/\//i.test(link)) {
    return reply(interaction, '⚠️ 看起來不是網址。訊息連結請右鍵那則訊息 → **複製訊息連結**。');
  }

  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  const notes = [];
  const parsed = parseMessageLink(link);

  if (parsed) {
    if (parsed.guildId !== guildId) {
      notes.push('⚠️ 這條連結指向**別的伺服器**，這裡的成員點了會看不到內容。');
    } else {
      // 能抓到就回報指向什麼，抓不到也只是警告（預覽展不展開看的是「觀看者」的權限，不是 bot 的）
      const channel = await interaction.guild.channels.fetch(parsed.channelId).catch(() => null);
      if (!channel) {
        notes.push('⚠️ Bot 看不到那個頻道，無法確認連結有效。');
      } else {
        const target = await channel.messages.fetch(parsed.messageId).catch(() => null);
        if (!target) {
          notes.push(`⚠️ 在 <#${channel.id}> 找不到那則訊息（可能已被刪除）。`);
        } else {
          const images = target.attachments.filter((a) => (a.contentType ?? '').startsWith('image/')).size;
          notes.push(`指向 <#${channel.id}> 的一則訊息` +
            (images ? `，含 ${images} 張圖片。` : '。') +
            '\n預覽能不能展開，看的是**觀看者**在那個頻道的權限。');
        }
      }
    }
  } else {
    notes.push('這不是 Discord 訊息連結，會當成普通網址直接貼出。');
  }

  const id = addTrigger(guildId, {
    keywords, responseType: 'link', payload: link, leadText, cooldownMs,
  });
  return interaction.editReply([
    `✅ 已新增觸發 **#${id}**（連結）`,
    `關鍵字：${keywords.map((k) => `\`${k}\``).join('、')}`,
    leadText ? `附帶文字：${leadText}` : '附帶文字：（無）',
    describeCooldown(cooldownMs),
    ...notes,
  ].join('\n'));
}

async function listAll(interaction, guildId) {
  const triggers = listTriggers(guildId);
  if (triggers.length === 0) {
    return reply(interaction, '還沒有任何觸發。用 `/trigger add-sticker` 或 `/trigger add-link` 新增。');
  }
  const stickers = await interaction.guild.stickers.fetch().catch(() => null);

  const lines = triggers.map((t) => {
    const cd = t.cooldown_ms ? `${t.cooldown_ms / 1000}s` : '無冷卻';
    let target;
    if (t.response_type === 'sticker') {
      const sticker = stickers?.get(t.payload);
      target = sticker ? `🎴 **${sticker.name}**` : `🎴 \`${t.payload}\` ⚠️ 貼圖已不存在`;
    } else {
      const parsed = parseMessageLink(t.payload);
      target = parsed ? `🔗 <#${parsed.channelId}> 的訊息` : `🔗 ${t.payload}`;
      if (t.lead_text) target += `\n　　附帶：${t.lead_text}`;
    }
    return `**#${t.trigger_id}** ${t.enabled ? '🟢' : '⏸️'} ${t.keywordList.map((k) => `\`${k}\``).join('、')}\n` +
      `　→ ${target} · 冷卻 ${cd}`;
  });

  const embed = new EmbedBuilder()
    .setTitle('🎯 關鍵字自動回應')
    .setColor(0x9b59b6)
    .setDescription(lines.join('\n'))
    .setFooter({ text: `本次啟動以來：回應 ${num(triggerStats.fired)} 次 · 冷卻擋下 ${num(triggerStats.onCooldown)} · 失敗 ${num(triggerStats.failed)}` });
  return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
}

function editKeywords(interaction, guildId) {
  const id = interaction.options.getInteger('id');
  const input = parseKeywords(interaction.options.getString('value'));
  const mode = interaction.options.getString('mode') ?? 'replace';
  if (input.length === 0) return reply(interaction, '⚠️ 至少要一個關鍵字。');

  const trigger = listTriggers(guildId).find((t) => t.trigger_id === id);
  if (!trigger) return reply(interaction, `找不到觸發 #${id}。`);

  let next;
  if (mode === 'add') next = [...new Set([...trigger.keywordList, ...input])];
  else if (mode === 'remove') next = trigger.keywordList.filter((k) => !input.includes(k));
  else next = input;

  if (next.length === 0) {
    return reply(interaction,
      '⚠️ 這樣會把關鍵字清空，觸發器就永遠不會中了。要停用請用 `toggle`，要刪除請用 `remove`。');
  }

  updateTriggerKeywords(guildId, id, next);
  return reply(interaction, [
    `✅ 觸發 #${id} 的關鍵字已更新（${mode === 'add' ? '新增' : mode === 'remove' ? '移除' : '取代'}）`,
    `原本：${trigger.keywordList.map((k) => `\`${k}\``).join('、')}`,
    `現在：${next.map((k) => `\`${k}\``).join('、')}`,
  ].join('\n'));
}

function describeCooldown(ms) {
  return `冷卻：${ms ? `同一頻道 ${ms / 1000} 秒` : '不限制 ⚠️'}`;
}

function reply(interaction, content) {
  return interaction.reply({ content, flags: MessageFlags.Ephemeral });
}
