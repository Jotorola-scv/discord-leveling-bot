import { SlashCommandBuilder, PermissionFlagsBits } from 'discord.js';
import { listAllMembers, listRewards } from '../lib/db.js';
import { applyRewards } from '../lib/xp.js';
import { num } from '../lib/format.js';

export const data = new SlashCommandBuilder()
  .setName('sync-roles')
  .setDescription('依資料庫現況重新發一次等級角色（用來補歷史錯誤）')
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild);

export async function execute(interaction) {
  const rewards = listRewards(interaction.guildId);
  if (rewards.length === 0) {
    return interaction.reply('這個伺服器還沒設定任何等級角色獎勵，先用 `/level-config reward-add`。');
  }

  await interaction.deferReply();
  const rows = listAllMembers(interaction.guildId);
  await interaction.guild.members.fetch().catch(() => null);

  let touched = 0;
  let failed = 0;
  let skipped = 0;

  for (const row of rows) {
    const member = interaction.guild.members.cache.get(row.user_id);
    if (!member) { skipped++; continue; }
    const result = await applyRewards(member, row.level);
    if (result.added.length || result.removed.length) touched++;
    failed += result.failed.length;
  }

  return interaction.editReply(
    `🔄 同步完成：掃描 ${num(rows.length)} 筆，調整 **${num(touched)}** 位成員的角色。\n` +
    `已離開伺服器略過 ${num(skipped)} 筆` + (failed ? ` · ⚠️ ${num(failed)} 次指派失敗（多半是 Bot 角色不夠高，詳見 log）` : '')
  );
}
