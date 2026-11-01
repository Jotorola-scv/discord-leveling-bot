import { SlashCommandBuilder, EmbedBuilder, MessageFlags } from 'discord.js';
import { getMember, getRank, isIgnoredUser } from '../lib/db.js';
import { progressOf, xpForNext } from '../lib/leveling.js';
import { progressBar, num } from '../lib/format.js';

export const data = new SlashCommandBuilder()
  .setName('rank')
  .setDescription('查看自己或指定成員的等級')
  .addUserOption((o) => o.setName('user').setDescription('要查誰（預設是你自己）'));

export async function execute(interaction) {
  const target = interaction.options.getUser('user') ?? interaction.user;
  if (target.bot) {
    return interaction.reply({ content: 'Bot 不會累積 XP。', flags: MessageFlags.Ephemeral });
  }

  const row = getMember(interaction.guildId, target.id);
  const p = progressOf(row.total_xp);
  const rank = getRank(interaction.guildId, target.id);
  const excluded = isIgnoredUser(interaction.guildId, target.id);
  const member = await interaction.guild.members.fetch(target.id).catch(() => null);

  const embed = new EmbedBuilder()
    .setAuthor({
      name: member?.displayName ?? target.username,
      iconURL: target.displayAvatarURL({ size: 128 }),
    })
    .setColor(member?.displayColor || 0x5865f2)
    .addFields(
      { name: '等級', value: `**${p.level}**`, inline: true },
      { name: '伺服器排名', value: excluded ? '已排除' : (rank ? `**#${rank}**` : '—'), inline: true },
      { name: '總 XP', value: `**${num(row.total_xp)}**`, inline: true },
      {
        name: `本級進度 — 還差 ${num(p.remaining)} XP`,
        value: `\`${progressBar(p.ratio)}\` ${num(p.into)} / ${num(p.need)}`,
      },
    )
    .setFooter({
      text: excluded
        ? '此成員已被排除在等級系統外：不累積 XP、不上排行榜'
        : `升到 Lv.${p.level + 1} 需要 ${num(xpForNext(p.level))} XP`,
    });

  return interaction.reply({ embeds: [embed] });
}
