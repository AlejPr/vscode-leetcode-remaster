// Run after npm run compile: node test/submission-results.js
'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { createRequire } = require('module');
const { parseTestRun, getTestCases, renderTestRun } = require('../out/src/webview/testResults');
const root = path.join(__dirname, '..');
const cliRequire = createRequire(path.join(root, 'cli/package.json'));
const base = {
  version: 1, status: 'Wrong Answer', runtime: '0 ms',
  input: '[2,7,11,15]\n9\n[3,2,4]\n6\n[3,3]\n6',
  metadata: {params: [{name: 'nums'}, {name: 'target'}]},
  outputs: ['[0,1]', '[0,1]', '[1,0]'], expected: ['[0,1]', '[1,2]', '[0,1]'],
  comparison: '101', correct: false, errors: [], stdout: '', stdoutByCase: []
};
const encode = run => 'LEETCODE_TEST_RESULT:' + Buffer.from(JSON.stringify(run)).toString('base64');
assert.deepStrictEqual(parseTestRun('logs\n' + encode(base) + '\n'), base);
assert.strictEqual(parseTestRun('legacy result'), undefined);
assert.strictEqual(parseTestRun('LEETCODE_TEST_RESULT:aGVsbG8='), undefined);
assert.strictEqual(parseTestRun(encode({...base, outputs: [42]})), undefined);
const padded = {...base, input: base.input + '\r\n\r\n', outputs: [...base.outputs, ''], expected: [...base.expected, '']};
assert.strictEqual(getTestCases(padded).length, 3);
assert.strictEqual(getTestCases({...padded, metadata: {}}).length, 3);
assert.strictEqual(getTestCases({...padded, metadata: {}, comparison: ''}).length, 3);
assert.strictEqual((renderTestRun(padded).match(/<button role="tab"/g) || []).length, 3);
assert(!renderTestRun(padded).includes('Full input'));
assert(!renderTestRun({...base, metadata: {}, input: 'a\nb\nc\nd'}).includes('Full input'));
const emptyAnswers = {...base, input: '1\n2\n3', metadata: {params: [{name: 'n'}]}, outputs: ['', '', ''], expected: ['', '', ''], comparison: '111'};
assert.strictEqual(getTestCases(emptyAnswers).length, 3);
assert.strictEqual(getTestCases(emptyAnswers)[2].output, '');
const cases = getTestCases(base);
assert.deepStrictEqual(cases.map(c => c.correct), [true, false, true]);
assert.deepStrictEqual(cases[1].inputs, [{name: 'nums', value: '[3,2,4]'}, {name: 'target', value: '6'}]);
assert.strictEqual(cases[2].correct, true); // Alternative valid index order follows the judge.
assert.deepStrictEqual(getTestCases({...base, comparison: ''}).map(c => c.correct), [null, null, null]);
assert.deepStrictEqual(getTestCases({...base, comparison: '', correct: true}).map(c => c.correct), [true, true, true]);
const error = getTestCases({...base, outputs: [], expected: [], correct: null, comparison: '', status: 'Runtime Error', errors: ['oops']});
assert.strictEqual(error.length, 3);
assert(error.every(c => c.correct === null && c.output === undefined));
const design = getTestCases({...base, input: '["Queue","push"]\n[[],[1]]', metadata: {systemdesign: true}, outputs: ['[null,null]'], expected: [], comparison: '1'});
assert.deepStrictEqual(design[0].inputs.map(i => i.name), ['operations', 'arguments']);
assert.strictEqual(getTestCases({...base, metadata: {}})[1].inputs[0].value, '[3,2,4]');
assert(getTestCases({...base, metadata: {}, input: 'a\nb\nc\nd'}).every(c => c.inputs.length === 0));
for (const status of ['Compile Error', 'Compilation Error']) {
  const compileHtml = renderTestRun({...base, status, errors: ['error: missing semicolon']});
  assert(compileHtml.includes('missing semicolon'));
  assert(!compileHtml.includes('role="tablist"'));
  assert(!compileHtml.includes('<div role="tabpanel"'));
  assert(!compileHtml.includes('<h3>Input</h3>'));
  assert(!compileHtml.includes('<h3>Output</h3>'));
  assert(!compileHtml.includes('<h3>Expected</h3>'));
}
assert(renderTestRun({...base, status: 'Runtime Error'}).includes('role="tablist"'));
const html = renderTestRun(base);
const consoleRun = {...base, stdout: 'legacy combined output', stdoutByCase: ['first line\nsecond line\n', '', 'third case\n', '']};
assert.deepStrictEqual(getTestCases(consoleRun).map(item => item.stdout), ['first line\nsecond line\n', '', 'third case\n']);
const consoleHtml = renderTestRun(consoleRun);
const consolePanels = consoleHtml.split('<div role="tabpanel"').slice(1).map(panel => panel.split('<script nonce=')[0]);
assert.strictEqual(consolePanels.length, 3);
assert(consolePanels[0].includes('first line\nsecond line\n'));
assert(!consolePanels[0].includes('third case'));
assert(!consolePanels[1].includes('<h3>Console output</h3>'));
assert(consolePanels[2].includes('third case\n'));
assert(!consoleHtml.includes('legacy combined output'));
assert(!consoleHtml.includes('Combined console output'));
assert(renderTestRun({...base, stdoutByCase: ['<script>alert(1)</script>']}).includes('&lt;script&gt;alert(1)&lt;/script&gt;'));
assert.strictEqual(parseTestRun(encode({...base, stdoutByCase: [null]})), undefined);
assert(html.includes('Runtime: 0 ms'));
assert(html.includes('class="failed">Wrong Answer'));
const malicious = renderTestRun({...base, stdout: '</pre><script>globalThis.hacked=true</script>', outputs: ['<img src=x onerror=alert(1)>']});
assert(!malicious.includes('<img src=x'));
assert(malicious.includes('&lt;img src=x'));
assert(malicious.includes('&lt;/pre&gt;&lt;script&gt;'));
assert(html.includes("default-src 'none'"));

// Exercise the real CLI formatter and command output without network or user credentials.
const pluginSource = fs.readFileSync(path.join(root, 'cli/lib/plugins/leetcode.js'), 'utf8');
const commandSource = fs.readFileSync(path.join(root, 'cli/lib/commands/test.js'), 'utf8');
const logs = [];
const context = { _: cliRequire('underscore'), lodash: cliRequire('lodash'), util: require('util'), Buffer,
  file: {exist: () => true, meta: () => ({id: '1', lang: 'rust'})},
  h: {prettyText: text => 'v' + text},
  log: {info: line => logs.push(line), fail: error => {throw new Error(error);}}
};
vm.createContext(context);
vm.runInContext(pluginSource.slice(pluginSource.indexOf('function formatResult('), pluginSource.indexOf('plugin.testProblem =')), context);
const consoleFormatted = context.formatResult({run_success: true, status_msg: 'Accepted', submission_id: 'interpret-example',
  code_output: ['combined'], std_output_list: ['first\nsecond\n', '', 'third\n']});
assert.deepStrictEqual(consoleFormatted.stdout_by_case, ['first\nsecond\n', '', 'third\n']);
const fallbackConsole = context.formatResult({run_success: true, status_msg: 'Accepted', submission_id: 'interpret-example',
  code_output: ['first\nsecond\n', '', 'third\n']});
assert.deepStrictEqual(fallbackConsole.stdout_by_case, ['first\nsecond\n', '', 'third\n']);
vm.runInContext(commandSource.slice(commandSource.indexOf('function printResult('), commandSource.indexOf('cmd.handler =')), context);
const formatted = context.formatResult({run_success: true, status_msg: 'Accepted', status_runtime: '0 ms',
  submission_id: 'interpret-example', code_answer: base.outputs, expected_code_answer: base.expected,
  code_output: [], correct_answer: false, compare_result: '101'});
formatted.type = 'Actual';
context.core = {getProblem: (_id, _translation, cb) => cb(null, {testable: true, testcase: base.input, templateMeta: base.metadata}),
  testProblem: (_problem, cb) => cb(null, [formatted])};
context.runTest({filename: 'solution.rs', webview: true});
const received = parseTestRun(logs.join('\n'));
assert.deepStrictEqual(received, base);
logs.length = 0;
context.runTest({filename: 'solution.rs'});
assert(!logs.some(line => line.startsWith('LEETCODE_TEST_RESULT:')));

// Test the actual inline script against a small DOM harness (no extra dependencies).
const tabCount = cases.length;
let savedState;
const tabs = Array.from({length: tabCount}, () => ({attributes: {}, listeners: {},
  setAttribute(key, value) {this.attributes[key] = value;},
  addEventListener(key, fn) {this.listeners[key] = fn;},
  focus() {this.focused = true;}
}));
const panels = Array.from({length: tabCount}, () => ({hidden: false}));
const script = /<script nonce="[^"]+">([\s\S]*?)<\/script>/.exec(html)[1];
vm.runInNewContext(script, {document: {querySelectorAll: selector => selector === '[role="tab"]' ? tabs : panels},
  acquireVsCodeApi: () => ({getState: () => undefined, setState: state => {savedState = state;}})});
assert.strictEqual(savedState.selected, 1);
assert(tabs[1].focused);
tabs[2].listeners.click();
assert.deepStrictEqual(panels.map(p => p.hidden), [true, true, false]);
assert.strictEqual(savedState.selected, 2);
let prevented = false;
tabs[2].listeners.keydown({key: 'ArrowRight', preventDefault() {prevented = true;}});
assert(prevented && tabs[0].focused);
assert.deepStrictEqual(panels.map(p => p.hidden), [false, true, true]);
tabs[0].listeners.keydown({key: 'End', preventDefault() {}});
assert.strictEqual(savedState.selected, 2);
const previousState = savedState;
vm.runInNewContext(script, {document: {querySelectorAll: selector => selector === '[role="tab"]' ? tabs : panels},
  acquireVsCodeApi: () => ({getState: () => previousState, setState: state => {savedState = state;}})});
assert.strictEqual(savedState.selected, 1);
assert.deepStrictEqual(panels.map(p => p.hidden), [true, false, true]);
assert.strictEqual(tabs[1].attributes['aria-selected'], 'true');
console.log('Passed submission UI checks: structured CLI data, verdicts, input grouping, errors, escaping, and tab navigation.');
