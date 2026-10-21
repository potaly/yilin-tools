/**
 * 把 AI 配置写进 Redis（yilin:config:ai）。
 *
 *   pnpm config:ai
 *
 * 交互式输入，密钥不写进任何文件、不进仓库、不打印到屏幕。
 * 需要 .env.local 里有 UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN。
 */

import { createInterface } from 'node:readline/promises';
import { readFileSync } from 'node:fs';
import { stdin, stdout } from 'node:process';
import { Redis } from '@upstash/redis';

function loadEnv(file: string) {
  try {
    for (const line of readFileSync(file, 'utf8').split('\n')) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
    }
  } catch {
    /* 文件不存在就算了 */
  }
}

/** 输入时不回显 */
async function askSecret(question: string): Promise<string> {
  stdout.write(question);
  const wasRaw = stdin.isRaw;
  stdin.setRawMode?.(true);
  stdin.resume();
  let value = '';
  await new Promise<void>((resolve) => {
    const onData = (buf: Buffer) => {
      const ch = buf.toString('utf8');
      if (ch === '\n' || ch === '\r' || ch === '\u0004') {
        stdin.off('data', onData);
        resolve();
      } else if (ch === '\u0003') {
        process.exit(130);
      } else if (ch === '\u007f') {
        value = value.slice(0, -1);
      } else {
        value += ch;
      }
    };
    stdin.on('data', onData);
  });
  stdin.setRawMode?.(wasRaw ?? false);
  stdin.pause();
  stdout.write('\n');
  return value.trim();
}

async function main() {
  loadEnv('.env.local');
  loadEnv('.env');

  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) {
    console.error('缺少 UPSTASH_REDIS_REST_URL 或 UPSTASH_REDIS_REST_TOKEN，请先写进 .env.local');
    process.exit(1);
  }

  const rl = createInterface({ input: stdin, output: stdout });
  const baseUrl =
    (await rl.question('AI_BASE_URL [https://api.deepseek.com]: ')).trim() ||
    'https://api.deepseek.com';
  const model = (await rl.question('AI_MODEL [deepseek-flash]: ')).trim() || 'deepseek-flash';
  rl.close();

  const apiKey = await askSecret('AI_API_KEY（输入不会显示）: ');
  if (!apiKey) {
    console.error('没有输入密钥，已取消');
    process.exit(1);
  }

  const ns = process.env.REDIS_NAMESPACE || 'yilin:';
  const key = `${ns}config:ai`;
  const redis = new Redis({ url, token });
  await redis.set(key, {
    baseUrl: baseUrl.replace(/\/+$/, ''),
    model,
    apiKey,
    updatedAt: new Date().toISOString(),
  });

  const saved = await redis.get<{ apiKey?: string; model?: string }>(key);
  console.log(`\n已写入 ${key}`);
  console.log(`  模型: ${saved?.model}`);
  console.log(`  密钥: ****${(saved?.apiKey ?? '').slice(-4)}`);
  console.log('\n提示：生产环境不要再配置 AI_API_KEY 环境变量，否则会覆盖这里的值。');
}

main().catch((e) => {
  console.error('写入失败:', e.message);
  process.exit(1);
});
