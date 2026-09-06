// Run after npm run compile: node test/test-command-result.js
'use strict';
const assert = require('assert');
const { testCommandResult } = require('../out/src/utils/testCommandResult');
const { parseTestRun, renderTestRun } = require('../out/src/webview/testResults');

const run = {
  version: 1, status: 'Compile Error', runtime: 'N/A',
  input: '[2,7,11,15]\n9\n[3,2,4]\n6\n[3,3]\n6',
  metadata: {name: 'twoSum', params: [{name: 'nums', type: 'integer[]'}, {name: 'target', type: 'integer'}]},
  outputs: [], expected: [], comparison: '', correct: null,
  errors: ['Line 4: Char 54: error: mismatched types (solution.rs)',
    'expected `()`, found `Option<usize>`\nhelp: consider using a semicolon here: `;`'],
  stdout: ''
};
const raw = 'NOTE: to finish the input, press <Ctrl-D> and <Return>\nLEETCODE_TEST_RESULT:' +
  Buffer.from(JSON.stringify(run)).toString('base64') + '\n';
const failure = output => Object.assign(new Error('Command failed with exit code "0"'), {result: output});

async function main() {
  assert.strictEqual(await testCommandResult(Promise.resolve(raw)), raw);
  const recovered = await testCommandResult(Promise.reject(failure(raw)));
  assert.deepStrictEqual(parseTestRun(recovered), run);
  const html = renderTestRun(parseTestRun(recovered));
  assert(html.includes('Compile Error'));
  assert(html.includes('Option&lt;usize&gt;'));
  assert(!html.includes('<div role="tablist"'));
  const expired = '[ERROR] session expired, please login again [code=-1]\n';
  await assert.rejects(testCommandResult(Promise.reject(failure(expired))), /LeetCode: Sign In/);
  await assert.rejects(testCommandResult(Promise.reject(failure(raw + expired))), /session expired/);
  await assert.rejects(testCommandResult(Promise.reject(failure('\u001b[31m' + expired + '\u001b[0m'))), /session expired/);
  await assert.rejects(testCommandResult(Promise.reject(failure('[ERROR] Network unavailable'))), /Network unavailable/);
  await assert.rejects(testCommandResult(Promise.reject(failure('[ERROR] LeetCode rejected the request (HTTP 403 Forbidden; response type: text/html).'))),
    error => error.message.includes('HTTP 403') && !error.message.includes('Sign In'));
  const malformed = failure('LEETCODE_TEST_RESULT:bm90LWpzb24=');
  await assert.rejects(testCommandResult(Promise.reject(malformed)), error => error === malformed);
  const spawnError = new Error('Could not start Node');
  await assert.rejects(testCommandResult(Promise.reject(spawnError)), error => error === spawnError);
  console.log('Passed test-result recovery checks: compile errors, expired sessions, malformed responses, and transport failures.');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
