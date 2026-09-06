// Run with node test/cli-layout.js. No network or authentication required.
'use strict';
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const {spawnSync} = require('child_process');
const root = path.resolve(__dirname, '..');
const manifest = require('../package.json');
const lock = require('../package-lock.json');

assert(!manifest.dependencies['vsc-leetcode-cli']);
assert(!lock.packages['node_modules/vsc-leetcode-cli']);
assert(!lock.dependencies['vsc-leetcode-cli']);
assert.deepStrictEqual(lock.packages[''].dependencies, manifest.dependencies);
for (const name of Object.keys(manifest.dependencies)) {
  assert(lock.packages['node_modules/' + name], 'Missing locked dependency: ' + name);
}

const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'leetcode CLI check '));
try {
  const result = spawnSync(process.execPath, ['-e', `
    const root = process.argv[1];
    const entry = root + '/cli/bin/leetcode';
    const scratch = process.argv[2];
    require(root + '/cli/lib/file').userHomeDir = () => scratch;
    process.argv = [process.execPath, entry, '--help'];
    require(entry);
  `, root, scratch], {cwd: scratch, encoding: 'utf8', timeout: 15000});
  assert.ifError(result.error);
  assert.strictEqual(result.status, 0, result.stdout + result.stderr);
  for (const command of ['cases', 'test', 'submit', 'plugin']) {
    assert(result.stdout.includes(command), 'Missing command: ' + command);
  }
} finally {
  assert(path.dirname(scratch) === path.resolve(os.tmpdir()));
  assert(path.basename(scratch).startsWith('leetcode CLI check '));
  fs.rmSync(scratch, {recursive: true, force: true});
}
console.log('Passed project CLI layout and startup checks.');
