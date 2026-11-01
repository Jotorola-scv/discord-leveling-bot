import { REST, Routes } from 'discord.js';
import { commands } from './commands/index.js';

const token = process.env.DISCORD_TOKEN;
const clientId = process.env.CLIENT_ID;
const guildId = process.env.GUILD_ID?.trim();

if (!token || !clientId) {
  console.error('缺少 DISCORD_TOKEN 或 CLIENT_ID。');
  process.exit(1);
}

const body = commands.map((c) => c.data.toJSON());
const rest = new REST().setToken(token);

const route = guildId
  ? Routes.applicationGuildCommands(clientId, guildId)
  : Routes.applicationCommands(clientId);

try {
  const result = await rest.put(route, { body });
  console.log(`✅ 已註冊 ${result.length} 個 slash command → ${guildId ? `伺服器 ${guildId}（秒生效）` : '全域（最多約 1 小時生效）'}`);
  for (const c of result) console.log(`   /${c.name}`);
} catch (err) {
  console.error('❌ 註冊失敗：', err);
  process.exit(1);
}
