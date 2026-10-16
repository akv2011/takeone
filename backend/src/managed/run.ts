import 'dotenv/config';
import { runOnce } from './runOnce.js';
import { workerIdentity } from './uploadProbe.js';
async function main() { console.log(await runOnce(workerIdentity(process.env), process.env)); }
main().catch(() => { console.error('worker_failed'); process.exitCode = 1; });
