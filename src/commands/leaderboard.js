import { SlashCommandBuilder, EmbedBuilder, MessageFlags } from 'discord.js';
import { getLeaderboard } from '../lib/db.js';
import { num } from '../lib/format.js';

const PAGE_SIZE = 10;
const MEDALS = ['🥇', '🥈', '🥉'];

export const data = new SlashCommandBuilder()
  .setName('leaderboard')
  .setDescription('伺服器等級排行榜')
  .addIntegerOption((o) => o.setName('page').setDescription('第幾頁（每頁 10 名）').setMinValue(1));

export async function execute(interaction) {
  const page = interaction.options.getInteger('page') ?? 1;
  const offset = (page - 1) * PAGE_SIZE;
  const { rows, total } = getLeaderboard(interaction.guildId, { limit: PAGE_SIZE, offset });
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  if (rows.length === 0) {
    return interaction.reply({
      content: total === 0 ? '還沒有人拿到 XP。' : `只有 ${pages} 頁，第 ${page} 頁是空的。`,
      flags: MessageFlags.Ephemeral,
    });
  }

  // 一次抓齊這頁的成員，避免逐筆 fetch
  const members = await interaction.guild.members
    .fetch({ user: rows.map((r) => r.user_id) })
    .catch(() => new Map());

  const lines = rows.map((row, i) => {
    const place = offset + i + 1;
    const badge = place <= 3 ? MEDALS[place - 1] : `\`#${String(place).padStart(2, ' ')}\``;
    const name = members.get(row.user_id)?.displayName ?? `(已離開伺服器 ${row.user_id})`;
    return `${badge} **${name}** — Lv.${row.level} · ${num(row.total_xp)} XP`;
  });

  const embed = new EmbedBuilder()
    .setTitle(`🏆 ${interaction.guild.name} 排行榜`)
    .setColor(0xf1c40f)
    .setDescription(lines.join('\n'))
    .setFooter({ text: `第 ${page} / ${pages} 頁 · 共 ${num(total)} 人上榜` });

  return interaction.reply({ embeds: [embed] });
}
