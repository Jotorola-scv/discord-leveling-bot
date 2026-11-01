import { SlashCommandBuilder, PermissionFlagsBits, MessageFlags } from 'discord.js';
import { addXp } from '../lib/db.js';
import { stripRewardsAbove } from '../lib/xp.js';
import { num } from '../lib/format.js';

export const data = new SlashCommandBuilder()
  .setName('remove-xp')
  .setDescription('扣某位成員的 XP（等級會一起下修）')
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
  .addUserOption((o) => o.setName('user').setDescription('對象').setRequired(true))
  .addIntegerOption((o) => o.setName('amount').setDescription('要扣多少 XP').setMinValue(1).setRequired(true))
  .addBooleanOption((o) => o.setName('strip-roles').setDescription('是否同時撤掉已不符資格的等級角色（預設否）'));

export async function execute(interaction) {
  const target = interaction.options.getUser('user');
  const amount = interaction.options.getInteger('amount');
  const strip = interaction.options.getBoolean('strip-roles') ?? false;
  if (target.bot) {
    return interaction.reply({ content: 'Bot 不會累積 XP。', flags: MessageFlags.Ephemeral });
  }

  await interaction.deferReply();
  const result = addXp(interaction.guildId, target.id, -amount);

  let roleNote = '';
  if (strip && result.after.level < result.before.level) {
    const member = await interaction.guild.members.fetch(target.id).catch(() => null);
    if (member) {
      const removed = await stripRewardsAbove(member, result.after.level);
      if (removed.length) roleNote = `\n撤除角色：${removed.map((id) => `<@&${id}>`).join('、')}`;
    }
  }

  return interaction.editReply(
    `✅ 扣了 <@${target.id}> **−${num(amount)} XP**\n` +
    `Lv.${result.before.level} → **Lv.${result.after.level}** · 總 XP ${num(result.after.total_xp)}` + roleNote
  );
}
