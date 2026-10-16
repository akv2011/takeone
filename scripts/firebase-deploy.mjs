// Deploys dist/ to Firebase Hosting and firestore.rules to Firestore through the REST APIs,
// so a deploy needs only an OAuth access token (GOOGLE_OAUTH_ACCESS_TOKEN), not a Firebase CLI login.
// Usage: GOOGLE_OAUTH_ACCESS_TOKEN=... FIREBASE_PROJECT=<project-id> node scripts/firebase-deploy.mjs [--hosting] [--rules]
import { createHash } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import { join, relative, sep } from 'node:path';
import { gzipSync } from 'node:zlib';

const token = process.env.GOOGLE_OAUTH_ACCESS_TOKEN?.trim();
const project = process.env.FIREBASE_PROJECT?.trim();
if (!token || !project) throw Error('GOOGLE_OAUTH_ACCESS_TOKEN and FIREBASE_PROJECT are required');
const args = new Set(process.argv.slice(2));
const doHosting = args.size === 0 || args.has('--hosting');
const doRules = args.size === 0 || args.has('--rules');
const config = JSON.parse(await readFile('firebase.json', 'utf8'));

async function api(url, init = {}) {
  const response = await fetch(url, { ...init, headers: { authorization: `Bearer ${token}`, 'x-goog-user-project': project, 'content-type': 'application/json', ...init.headers } });
  const text = await response.text();
  if (!response.ok) throw Error(`${init.method ?? 'GET'} ${new URL(url).pathname} failed: ${response.status} ${text.slice(0, 300)}`);
  return text ? JSON.parse(text) : {};
}

// firebase.json hosting keys map onto the REST ServingConfig; anything unmapped fails loudly instead of being dropped.
function servingConfig(hosting) {
  const known = new Set(['site', 'public', 'predeploy', 'trailingSlash', 'rewrites', 'headers', 'redirects', 'cleanUrls']);
  for (const key of Object.keys(hosting)) if (!known.has(key)) throw Error(`Unsupported hosting key in firebase.json: ${key}`);
  const out = {};
  if (hosting.trailingSlash === false) out.trailingSlashBehavior = 'REMOVE';
  if (hosting.trailingSlash === true) out.trailingSlashBehavior = 'ADD';
  if (hosting.cleanUrls) out.cleanUrls = true;
  if (hosting.rewrites) out.rewrites = hosting.rewrites.map(r => { if (!r.destination) throw Error('Only destination rewrites are supported'); return { glob: r.source, path: r.destination }; });
  if (hosting.headers) out.headers = hosting.headers.map(h => ({ glob: h.source, headers: Object.fromEntries(h.headers.map(x => [x.key, x.value])) }));
  if (hosting.redirects) out.redirects = hosting.redirects.map(r => ({ glob: r.source, location: r.destination, statusCode: r.type ?? 301 }));
  return out;
}

async function files(dir) {
  const out = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...await files(path)); else out.push(path);
  }
  return out;
}

if (doHosting) {
  const hosting = config.hosting;
  const site = hosting.site;
  const base = `https://firebasehosting.googleapis.com/v1beta1/sites/${site}`;
  const version = await api(`${base}/versions`, { method: 'POST', body: JSON.stringify({ config: servingConfig(hosting) }) });
  const byHash = new Map(), manifest = {};
  for (const path of await files(hosting.public)) {
    const gz = gzipSync(await readFile(path), { level: 9 });
    const hash = createHash('sha256').update(gz).digest('hex');
    manifest['/' + relative(hosting.public, path).split(sep).join('/')] = hash;
    byHash.set(hash, gz);
  }
  const populated = await api(`https://firebasehosting.googleapis.com/v1beta1/${version.name}:populateFiles`, { method: 'POST', body: JSON.stringify({ files: manifest }) });
  for (const hash of populated.uploadRequiredHashes ?? []) {
    const response = await fetch(`${populated.uploadUrl}/${hash}`, { method: 'POST', headers: { authorization: `Bearer ${token}`, 'content-type': 'application/octet-stream' }, body: byHash.get(hash) });
    if (!response.ok) throw Error(`Upload of ${hash.slice(0, 12)} failed: ${response.status}`);
  }
  await api(`https://firebasehosting.googleapis.com/v1beta1/${version.name}?update_mask=status`, { method: 'PATCH', body: JSON.stringify({ status: 'FINALIZED' }) });
  const release = await api(`${base}/releases?versionName=${encodeURIComponent(version.name)}`, { method: 'POST', body: '{}' });
  console.log(`hosting: ${Object.keys(manifest).length} files, ${(populated.uploadRequiredHashes ?? []).length} uploaded, released ${release.name}`);
}

if (doRules) {
  const content = await readFile(config.firestore.rules, 'utf8');
  const base = `https://firebaserules.googleapis.com/v1/projects/${project}`;
  const ruleset = await api(`${base}/rulesets`, { method: 'POST', body: JSON.stringify({ source: { files: [{ name: config.firestore.rules, content }] } }) });
  const releaseName = `projects/${project}/releases/cloud.firestore`;
  try {
    await api(`https://firebaserules.googleapis.com/v1/${releaseName}`, { method: 'PATCH', body: JSON.stringify({ release: { name: releaseName, rulesetName: ruleset.name } }) });
  } catch (error) {
    if (!String(error.message).includes(' 404 ')) throw error;
    await api(`${base}/releases`, { method: 'POST', body: JSON.stringify({ name: releaseName, rulesetName: ruleset.name }) });
  }
  console.log(`firestore rules: released ${ruleset.name}`);
}
