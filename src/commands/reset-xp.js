import {
  SlashCommandBuilder, PermissionFlagsBits, MessageFlags,
  ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType,
} from 'discord.js';
import { resetMember, resetGuild, getMember } from '../lib/db.js';
import { stripRewardsAbove } from '../lib/xp.js';
import { num } from '../lib/format.js';

export const data = new SlashCommandBuilder()
  .setName('reset-xp')
  .setDescription('重置 XP')
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
  .addSubcommand((s) => s
    .setName('user')
    .setDescription('重置單一成員')
    .addUserOption((o) => o.setName('user').setDescription('對象').setRequired(true))
    .addBooleanOption((o) => o.setName('strip-roles').setDescription('是否同時撤掉等級角色（預設是）')))
  .addSubcommand((s) => s
    .setName('all')
    .setDescription('重置整個伺服器（需二次確認，不可復原）'));

export async function execute(interaction) {
  if (interaction.options.getSubcommand() === 'user') return resetOne(interaction);
  return resetAll(interaction);
}

async function resetOne(interaction) {
  const target = interaction.options.getUser('user');
  const strip = interaction.options.getBoolean('strip-roles') ?? true;
  const before = getMember(interaction.guildId, target.id);

  await interaction.deferReply();
  resetMember(interaction.guildId, target.id);

  let roleNote = '';
  if (strip) {
    const member = await interaction.guild.members.fetch(target.id).catch(() => null);
    if (member) {
      const removed = await stripRewardsAbove(member, 0);
      if (removed.length) roleNote = `\n撤除角色：${removed.map((id) => `<@&${id}>`).join('、')}`;
    }
  }

  return interaction.editReply(
    `✅ 已重置 <@${target.id}>（原本 Lv.${before.level} · ${num(before.total_xp)} XP）` + roleNote
  );
}

async function resetAll(interaction) {
  const confirmId = `reset-all:${interaction.id}`;
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(confirmId).setLabel('確定，全部清空').setStyle(ButtonStyle.Danger),
    new ButtonBuilder().setCustomId(`${confirmId}:cancel`).setLabel('取消').setStyle(ButtonStyle.Secondary),
  );

  await interaction.reply({
    content: '⚠️ **這會清空整個伺服器所有人的 XP 與等級，不可復原。**\n60 秒內按下確認才會執行。',
    components: [row],
    flags: MessageFlags.Ephemeral,
  });

  const message = await interaction.fetchReply();

  let press;
  try {
    press = await message.awaitMessageComponent({
      componentType: ComponentType.Button,
      filter: (i) => i.user.id === interaction.user.id && i.customId.startsWith(confirmId),
      time: 60_000,
    });
  } catch {
    return interaction.editReply({ content: '⌛ 已逾時，沒有做任何變更。', components: [] });
  }

  if (press.customId.endsWith(':cancel')) {
    return press.update({ content: '已取消，沒有做任何變更。', components: [] });
  }

  const wiped = resetGuild(interaction.guildId);
  return press.update({
    content: `🧹 已清空 **${num(wiped)}** 位成員的 XP。等級角色沒有自動撤除——需要的話請手動處理。`,
    components: [],
  });
}
