import { SlashCommandBuilder, PermissionFlagsBits, MessageFlags } from 'discord.js';
import { addXp, getRank, isIgnoredUser } from '../lib/db.js';
import { applyRewards } from '../lib/xp.js';
import { num } from '../lib/format.js';

export const data = new SlashCommandBuilder()
  .setName('give-xp')
  .setDescription('給某位成員加 XP（會觸發升級與角色獎勵）')
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
  .addUserOption((o) => o.setName('user').setDescription('對象').setRequired(true))
  .addIntegerOption((o) => o.setName('amount').setDescription('要加多少 XP').setMinValue(1).setRequired(true));

export async function execute(interaction) {
  const target = interaction.options.getUser('user');
  const amount = interaction.options.getInteger('amount');
  if (target.bot) {
    return interaction.reply({ content: 'Bot 不會累積 XP。', flags: MessageFlags.Ephemeral });
  }

  await interaction.deferReply();
  // 17.8：管理通道不受 defer／重複／最短字數限制，但仍寫 last_xp_at
  const result = addXp(interaction.guildId, target.id, amount, { touchCooldown: true });

  let roleNote = '';
  if (result.leveledUp) {
    const member = await interaction.guild.members.fetch(target.id).catch(() => null);
    if (member) {
      const { added, failed } = await applyRewards(member, result.after.level);
      if (added.length) roleNote = `\n獲得角色：${added.map((id) => `<@&${id}>`).join('、')}`;
      if (failed.length) roleNote += `\n⚠️ 角色指派失敗 ${failed.length} 個，詳見 log（可稍後跑 \`/sync-roles\`）`;
    }
  }

  const rank = getRank(interaction.guildId, target.id);
  const excludedNote = isIgnoredUser(interaction.guildId, target.id)
    ? '\n⚠️ 這位成員目前被排除在等級系統外：XP 加上去了，但他不會再自然累積，也不會出現在排行榜。'
    : '';
  return interaction.editReply(
    `✅ 給了 <@${target.id}> **+${num(amount)} XP**\n` +
    `Lv.${result.before.level} → **Lv.${result.after.level}** · 總 XP ${num(result.after.total_xp)}` +
    (rank ? ` · 排名 #${rank}` : '') + roleNote + excludedNote
  );
}
