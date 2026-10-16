// Local CLI harness — run the full takeone pipeline from the terminal, no cloud service needed.
//   npm run takeone -- "make it vertical with a watermark" fixtures/sample.mp4
//   npm run takeone -- "why UPI beat credit cards in india"          (generate a reel)
//   npm run takeone -- "clip https://youtu.be/<id> 0:05 to 0:15"     (needs yt-dlp)
import 'dotenv/config';
import { resolve } from 'node:path';
import { existsSync, copyFileSync } from 'node:fs';
import { createTakeOne } from './app.js';

async function main() {
  const args = process.argv.slice(2);
  const text = args[0];
  const file = args[1];
  if (!text) {
    console.log('usage: npm run takeone -- "<message>" [path/to/video]');
    process.exit(1);
  }
  const attachmentPath = file ? resolve(file) : undefined;
  if (attachmentPath && !existsSync(attachmentPath)) { console.error(`file not found: ${attachmentPath}`); process.exit(1); }

  const takeone = createTakeOne();
  console.log(`\n▶ takeone: "${text}"${attachmentPath ? ` [${file}]` : ''}\n`);
  const replies = await takeone.handle({
    userId: 'cli-user', platform: 'cli', text, attachmentPath, isPro: false,
    confirmedOwnership: true,   // CLI implies you own/have rights to what you pass
  });
  for (const r of replies) {
    if (r.kind === 'text') { console.log(`💬 ${r.text}`); }
    else {
      const dest = resolve(`takeone-output-${Date.now()}.${r.filePath.split('.').pop()}`);
      copyFileSync(r.filePath, dest);
      console.log(`🎬 ${r.caption}\n   -> ${dest}`);
    }
  }
  console.log('');
}

main().catch((e) => { console.error('error:', e.message); process.exit(1); });
