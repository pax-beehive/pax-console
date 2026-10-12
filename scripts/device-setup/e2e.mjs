// Runs real generated commands, the Manager bootstrap renderer, and the paxd
// installer. Artifact binaries and the registration service are test fixtures;
// nothing is installed in the user's home and no real device is registered.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { spawn, execFileSync } from 'node:child_process';
import { createServer } from 'node:http';
import { mkdtemp, readFile, writeFile, mkdir, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildDeviceInstallCommand } from '../../src/components/settings/add-device-command.ts';

const renderer = process.env.PAX_SETUP_RENDERER;
const installerPath = process.env.PAXD_INSTALLER;
if (!renderer || !installerPath) throw new Error('Set PAX_SETUP_RENDERER and PAXD_INSTALLER; see README.md');
const installer = await readFile(installerPath);
const listen = async (handler) => {
  const server = createServer(handler);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  return { server, origin: `http://127.0.0.1:${server.address().port}` };
};
const close = (server) => new Promise((resolve) => server.close(resolve));
const run = (command, env) => new Promise((resolve, reject) => {
  const child = spawn('bash', ['-c', command], { env });
  let output = '';
  child.stdout.on('data', (data) => { output += data; });
  child.stderr.on('data', (data) => { output += data; });
  const timeout = setTimeout(() => child.kill('SIGKILL'), 30000);
  child.once('error', reject);
  child.once('close', (code) => { clearTimeout(timeout); resolve({ code, output }); });
});
const cases = [
  ['us', 'darwin', 'success'], ['hk', 'linux', 'success'],
  ['custom', 'linux', 'browser'], ['hk', 'darwin', 'expired'],
  ['us', 'linux', 'consumed'], ['hk', 'linux', 'html'],
  ['us', 'darwin', 'empty'], ['hk', 'linux', 'partial'],
  ['us', 'linux', 'checksum'], ['hk', 'darwin', 'artifact-error'],
  ['us', 'linux', 'resolver-error'], ['hk', 'linux', 'bootstrap-error'],
];
const results = [];
for (const [region, platform, scenario] of cases) {
  const dir = await mkdtemp(join(tmpdir(), 'pax-setup-e2e-'));
  const home = join(dir, 'home');
  const installDir = join(home, '.local', 'bin');
  const temp = join(dir, 'tmp');
  const fixtureBin = join(dir, 'fixtures');
  await Promise.all([mkdir(installDir, { recursive: true }), mkdir(temp), mkdir(fixtureBin)]);
  // Exercise the real installer's OS branches without needing another machine.
  await writeFile(join(fixtureBin, 'uname'), `#!/bin/bash\ncase "$1" in -s) echo ${platform === 'darwin' ? 'Darwin' : 'Linux'};; -m) echo x86_64;; *) exit 1;; esac\n`, { mode: 0o755 });
  const token = scenario === 'browser' ? '' : `reg_fixture_${region}`;
  const calls = [];
  const machine = await listen(async (req, res) => {
    let body = '';
    for await (const chunk of req) body += chunk;
    calls.push(req.url);
    assert.equal(req.method, 'POST');
    assert.equal(req.headers['x-registration-token'] ?? '', token);
    assert.equal(JSON.parse(body).region, region);
    const status = scenario === 'expired' ? 401 : scenario === 'consumed' ? 409 : 200;
    res.writeHead(status, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ data: { node_id: `node_${region}`, api_key: 'fixture-key' } }));
  });
  const paxl = Buffer.from('#!/bin/bash\necho "paxl fixture"\n');
  const paxd = Buffer.from(`#!/bin/bash
set -eu
if [ "$1" = --version ]; then echo 'paxd fixture'; exit 0; fi
[ "$1" = setup ] || exit 92
shift
cloud=''
while [ "$#" -gt 0 ]; do
  case "$1" in --cloud-url) cloud="$2"; shift 2;; --registration-token-env) shift;; *) exit 93;; esac
done
[ "$cloud" = "$PAX_CLOUD_URL" ] || exit 94
endpoint=/api/v1/node/register
[ -n "$PAX_REGISTRATION_TOKEN" ] || endpoint=/api/v1/node/registration/start
curl -fsS -X POST -H 'Content-Type: application/json' -H "X-Registration-Token: $PAX_REGISTRATION_TOKEN" --data '{"region":"${region}"}' "$cloud$endpoint" >/dev/null
printf connected > "$HOME/connected"
`);
  let bootstrap;
  let downloads;
  downloads = await listen((req, res) => {
    assert.equal(req.headers['x-registration-token'], undefined);
    assert.ok(!req.url.includes(token || 'never-a-token'));
    const url = new URL(req.url, downloads.origin);
    if (url.searchParams.get('setup') === '1') {
      if (scenario === 'bootstrap-error') { res.writeHead(503); res.end(); }
      else res.end(bootstrap);
    } else if (url.pathname.endsWith('/install.sh')) {
      if (scenario === 'html') res.end('<!DOCTYPE html>\n<html>Sign in</html>');
      else if (scenario === 'empty') res.end();
      else if (scenario === 'partial') { res.setHeader('Content-Length', installer.length + 100); res.end(installer.subarray(0, 80)); }
      else res.end(installer);
    } else if (url.pathname.endsWith('/download')) {
      if (scenario === 'resolver-error') { res.end('<html>Login</html>'); return; }
      const product = url.searchParams.get('product') ?? 'paxd';
      assert.equal(url.searchParams.get('platform'), `${platform}/amd64`);
      const bytes = product === 'paxl' ? paxl : paxd;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ data: {
        url: `${downloads.origin}/artifact/${product}`, version: 'fixture', size_bytes: bytes.length,
        sha256: scenario === 'checksum' ? '0'.repeat(64) : createHash('sha256').update(bytes).digest('hex'),
      } }));
    } else if (url.pathname.startsWith('/artifact/')) {
      if (scenario === 'artifact-error') { res.writeHead(403); res.end(); }
      else res.end(url.pathname.endsWith('paxl') ? paxl : paxd);
    } else { res.writeHead(404); res.end(); }
  });
  try {
    bootstrap = execFileSync(renderer, [downloads.origin, machine.origin], { encoding: 'utf8' });
    const command = buildDeviceInstallCommand({ script_url: `${downloads.origin}/api/v1/public/paxd/install.sh?setup=1`, machine_url: machine.origin }, token);
    const env = { ...process.env, HOME: home, TMPDIR: temp, PAX_INSTALL_DIR: installDir, PATH: `${fixtureBin}:${process.env.PATH}`, PAX_REGISTRATION_TOKEN: 'stale-token', PAX_CLOUD_URL: 'https://wrong.example', PAX_DOWNLOAD_URL: 'https://wrong.example' };
    const result = await run(command, env);
    const succeeds = ['success', 'browser'].includes(scenario);
    assert.equal(result.code === 0, succeeds, `${region}/${scenario}: ${result.output}`);
    assert.ok(!result.output.includes(token || 'never-a-token'), 'token leaked');
    if (succeeds) {
      assert.equal(await readFile(join(home, 'connected'), 'utf8'), 'connected');
      assert.deepEqual(calls, [scenario === 'browser' ? '/api/v1/node/registration/start' : '/api/v1/node/register']);
      assert.ok((await readdir(installDir)).includes('paxl'));
      assert.ok((await readdir(installDir)).includes('paxd'));
    } else if (['expired', 'consumed'].includes(scenario)) {
      assert.equal(calls.length, 1, 'registration replayed');
    } else assert.equal(calls.length, 0, 'registered after failed install');
    assert.deepEqual(await readdir(temp), [], 'temporary scripts were not cleaned');
    results.push({ region, platform, scenario, pass: true, registration_requests: calls.length });
    process.stdout.write(`PASS ${region}/${platform}/${scenario}\n`);
  } finally {
    await Promise.all([close(downloads.server), close(machine.server)]);
    await rm(dir, { recursive: true, force: true });
  }
}
if (process.env.PAX_SETUP_REPORT) await writeFile(process.env.PAX_SETUP_REPORT, JSON.stringify({ checked_at: new Date().toISOString(), cases: results, scope: 'Real Console command, Manager renderer, paxd installer and curl; isolated fixture binaries/registration service; no production registration or OS service installation.' }, null, 2));
