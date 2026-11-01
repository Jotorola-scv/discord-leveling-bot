import { SlashCommandBuilder, PermissionFlagsBits, MessageFlags } from 'discord.js';
import { setLevel } from '../lib/db.js';
import { applyRewards, stripRewardsAbove } from '../lib/xp.js';
import { num } from '../lib/format.js';

export const data = new SlashCommandBuilder()
  .setName('set-level')
  .setDescription('直接設定等級（XP 重算為該級起點）')
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
  .addUserOption((o) => o.setName('user').setDescription('對象').setRequired(true))
  .addIntegerOption((o) => o.setName('level').setDescription('目標等級').setMinValue(0).setMaxValue(500).setRequired(true));

export async function execute(interaction) {
  const target = interaction.options.getUser('user');
  const level = interaction.options.getInteger('level');
  if (target.bot) {
    return interaction.reply({ content: 'Bot 不會累積 XP。', flags: MessageFlags.Ephemeral });
  }

  await interaction.deferReply();
  const result = setLevel(interaction.guildId, target.id, level);

  // 把角色對齊到新等級：該有的補上、不該有的撤掉
  let roleNote = '';
  const member = await interaction.guild.members.fetch(target.id).catch(() => null);
  if (member) {
    const { added, failed } = await applyRewards(member, level);
    const removed = await stripRewardsAbove(member, level);
    if (added.length) roleNote += `\n獲得角色：${added.map((id) => `<@&${id}>`).join('、')}`;
    if (removed.length) roleNote += `\n撤除角色：${removed.map((id) => `<@&${id}>`).join('、')}`;
    if (failed.length) roleNote += `\n⚠️ 角色指派失敗 ${failed.length} 個，詳見 log`;
  }

  return interaction.editReply(
    `✅ <@${target.id}> 設為 **Lv.${level}**（Lv.${result.before.level} → Lv.${level}）\n` +
    `總 XP 重算為 ${num(result.after.total_xp)}` + roleNote
  );
}
