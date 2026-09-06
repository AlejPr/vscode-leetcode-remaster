// Run after npm run compile: node test/test-case-editor.js
'use strict';
const assert = require('assert');
const fs = require('fs');
const vm = require('vm');
const {parseCaseExamples, validDraft, serializeCases, renderCaseEditor} = require('../out/src/webview/testCaseEditor');
const encode = data => 'LEETCODE_CASES:' + Buffer.from(JSON.stringify(data)).toString('base64');
const data = {examples: ['[2,7,11,15]\n9', '[3,2,4]\n6', '[3,3]\n6'], metadata: {params: [{name: 'nums'}, {name: 'target'}]}};
const examples = parseCaseExamples(encode(data));
assert.deepStrictEqual(examples.names, ['nums', 'target']);
assert.strictEqual(examples.cases.length, 3);
assert.deepStrictEqual(examples.cases[1], ['[3,2,4]', '6']);
assert.strictEqual(parseCaseExamples(encode({examples: ['1\n2'], metadata: {}})).raw, true);
assert.deepStrictEqual(parseCaseExamples(encode({examples: ['["Queue"]\n[[]]'], metadata: {systemdesign: true}})).names, ['operations', 'arguments']);
assert.throws(() => parseCaseExamples('failed'), /did not return/);
assert(validDraft({cases: [['[]', '0']], selected: 0}, 2));
assert(!validDraft({cases: [['[]']], selected: 0}, 2));
assert(!validDraft({cases: [['[]', '0']], selected: 3}, 2));
assert.strictEqual(serializeCases([['[\n1, 2\n]', '3']], false), '[1,2]\n3');
assert.strictEqual(serializeCases([['9007199254740993']], false), '9007199254740993');
assert.strictEqual(serializeCases([['"a\\nb"']], false), '"a\\nb"');
assert.strictEqual(serializeCases([['"`$() \\"quoted\\""']], false), '"`$() \\"quoted\\""');
assert.throws(() => serializeCases([['']], false), /Case 1/);
assert.throws(() => serializeCases([['unquoted']], false), /double quotes/);
assert.strictEqual(serializeCases([['[1, 2]\n3']], true), '[1,2]\n3');

// Exercise the editor script with a DOM harness, including edits and navigation.
function browser(html) {
  const elements = new Map();
  function element(tag) {
    return {tagName: tag, children: [], attributes: {}, value: '', style: {}, scrollHeight: 42,
      set id(id) {this._id = id; elements.set(id, this);}, get id() {return this._id;},
      setAttribute(key, value) {this.attributes[key] = value;},
      appendChild(child) {this.children.push(child);}, replaceChildren() {this.children = [];},
      focus() {this.focused = true;}};
  }
  for (const id of ['title','tabs','fields','run','add','reset','retry','error']) {
    element('div').id = id;
  }
  const messages = [];
  let receiver;
  let resize;
  const timers = new Map();
  let timerId = 0;
  let now = 0;
  function advance(ms) {
    now += ms;
    for (const [id, timer] of [...timers]) {
      if (timer.due <= now) { timers.delete(id); timer.callback(); }
    }
  }
  const script = /<script nonce="[^"]+">([\s\S]*?)<\/script>/.exec(html)[1];
  vm.runInNewContext(script, {document: {getElementById: id => elements.get(id), createElement: element},
    ResizeObserver: class { constructor(callback) { resize = callback; } observe() {} },
    setTimeout: (callback, delay) => { timers.set(++timerId, {callback, due: now + delay}); return timerId; },
    clearTimeout: id => timers.delete(id),
    window: {addEventListener: (_event, callback) => {receiver = callback;}},
    acquireVsCodeApi: () => ({postMessage: message => messages.push(JSON.parse(JSON.stringify(message)))})});
  return {elements, messages, receive: data => receiver({data}),
    resize: width => resize([{contentRect: {width}}]),
    advance, flush: () => advance(2000)};
}
const draft = {cases: examples.cases, selected: 0};
const html = renderCaseEditor('token', examples.names, draft, '</script><img src=x>', '', false);
assert(!html.includes('</script><img src=x>'));
const ui = browser(html);
assert.strictEqual(ui.elements.get('input-0').style.height, '44px');
ui.elements.get('input-0').scrollHeight = 120;
ui.elements.get('input-0').oninput();
assert.strictEqual(ui.elements.get('input-0').style.height, '122px');
ui.elements.get('input-0').scrollHeight = 60;
ui.resize(600);
assert.strictEqual(ui.elements.get('input-0').style.height, '62px');
assert.strictEqual(ui.elements.get('tabs').children.length, 3);
assert.strictEqual(ui.elements.get('input-0').value, '[2,7,11,15]');
ui.elements.get('input-1').value = '10'; ui.elements.get('input-1').oninput();
assert.strictEqual(ui.messages.length, 0);
ui.elements.get('input-1').value = '11'; ui.elements.get('input-1').oninput();
ui.elements.get('input-1').value = '10'; ui.elements.get('input-1').oninput();
ui.flush();
assert.strictEqual(ui.messages.length, 1);
assert.strictEqual(ui.messages.at(-1).draft.cases[0][1], '10');
ui.elements.get('case-1').onclick();
ui.elements.get('case-1').onkeydown({key: 'Home', preventDefault() {}});
ui.elements.get('case-1').onclick();
ui.flush();
assert.strictEqual(ui.messages.length, 1);
assert.strictEqual(ui.elements.get('input-0').value, '[3,2,4]');
ui.elements.get('add').onclick();
assert.strictEqual(ui.elements.get('tabs').children.length, 4);
assert.strictEqual(ui.elements.get('input-0').value, '[3,2,4]');
assert.strictEqual(ui.elements.get('input-1').value, '6');
ui.elements.get('input-0').value = '[9,8]'; ui.elements.get('input-0').oninput();
ui.flush();
assert.strictEqual(ui.messages.at(-1).draft.cases[1][0], '[3,2,4]');
assert.strictEqual(ui.messages.at(-1).draft.cases[3][0], '[9,8]');
ui.elements.get('close-case-3').onclick();
assert.strictEqual(ui.elements.get('tabs').children.length, 3);
assert(!html.includes('id="delete"'));
ui.elements.get('close-case-0').onclick();
assert.strictEqual(ui.messages.at(-1).draft.selected, 1);
assert.strictEqual(ui.elements.get('input-0').value, '[3,3]');
ui.elements.get('close-case-1').onclick();
assert.strictEqual(ui.messages.at(-1).draft.selected, 0);
assert.strictEqual(ui.elements.get('close-case-0').hidden, true);
ui.elements.get('close-case-0').onclick();
assert.strictEqual(ui.elements.get('tabs').children.length, 1);
ui.elements.get('run').onclick();
assert.strictEqual(ui.messages.at(-1).command, 'run');
assert.strictEqual(ui.elements.get('run').disabled, true);
ui.receive({command: 'status', token: 'token', busy: false, error: 'Invalid input'});
assert.strictEqual(ui.elements.get('error').textContent, 'Invalid input');
assert.strictEqual(ui.elements.get('run').disabled, false);
ui.receive({command: 'saved', token: 'old-token'});
assert(!html.includes('id="saved"'));

// Switching cases keeps the pending timer and saves edits to their original cases.
const switching = browser(html);
switching.elements.get('input-1').value = '12'; switching.elements.get('input-1').oninput();
switching.advance(1000);
switching.elements.get('case-1').onclick();
switching.advance(999);
assert.strictEqual(switching.messages.length, 0);
switching.advance(1);
assert.strictEqual(switching.messages.length, 1);
assert.strictEqual(switching.messages[0].draft.cases[0][1], '12');
assert.strictEqual(switching.messages[0].draft.cases[1][1], '6');
switching.elements.get('input-1').value = '8'; switching.elements.get('input-1').oninput();
switching.advance(1000);
switching.elements.get('case-0').onclick();
switching.elements.get('input-1').value = '14'; switching.elements.get('input-1').oninput();
switching.advance(1999);
assert.strictEqual(switching.messages.length, 1);
switching.advance(1);
assert.strictEqual(switching.messages.length, 2);
assert.strictEqual(switching.messages[1].draft.cases[0][1], '14');
assert.strictEqual(switching.messages[1].draft.cases[1][1], '8');

async function providerChecks() {
  const shared = {UserStatus: {SignedIn: 1, SignedOut: 2}};
  const store = new Map();
  let endpoint = 'leetcode';
  let signedOut = false;
  const runs = [], results = [], opened = [];
  let saves = 0;
  const sandbox = {exports: {}, require(name) {
    if (name === 'crypto') return require('crypto');
    if (name === 'vscode') return {ViewColumn: {One: 1, Two: 2}, Uri: {file: fsPath => ({fsPath})}, workspace: {
      openTextDocument: async uri => {opened.push(uri.fsPath); return {isDirty: true, save: async () => {saves++; return true;}};}}};
    if (name === '../commands/plugin') return {getLeetCodeEndpoint: () => endpoint};
    if (name === '../leetCodeExecutor') return {leetCodeExecutor: {getTestCases: async () => encode(data),
      testEditedCases: async (file, input) => {runs.push({file, input}); return 'result';}}};
    if (name === '../leetCodeManager') return {leetCodeManager: {getStatus: () => signedOut ? shared.UserStatus.SignedOut : shared.UserStatus.SignedIn}};
    if (name === '../shared') return shared;
    if (name === '../utils/settingUtils') return {shouldUseEndpointTranslation: () => false};
    if (name === './LeetCodeWebview') return {LeetCodeWebview: class {async showWebviewInternal() {this.panel = {webview: {html: this.getWebviewContent(), postMessage() {}}};}}};
    if (name === './leetCodeSubmissionProvider') return {leetCodeSubmissionProvider: {show: result => results.push(result)}};
    if (name === './testCaseEditor') return require('../out/src/webview/testCaseEditor');
    throw new Error(name);
  }};
  vm.runInNewContext(fs.readFileSync(require.resolve('../out/src/webview/leetCodeTestCasesProvider'), 'utf8'), sandbox);
  const provider = sandbox.exports.leetCodeTestCasesProvider;
  provider.initialize({workspaceState: {get: key => store.get(key), update: async (key, value) => store.set(key, JSON.parse(JSON.stringify(value)))}});
  const problem = {id: '1', name: 'Two Sum'};
  await provider.show(true, problem, 'solution.rs');
  const token = provider.token;
  const edited = {cases: [['[1,2]', '3']], selected: 0};
  await provider.onDidReceiveMessage({command: 'change', token, draft: edited});
  await provider.show(true, problem, 'solution.rs');
  assert.deepStrictEqual(provider.draft, edited);
  await provider.onDidReceiveMessage({command: 'change', token, draft: {cases: [['[]','0']], selected: 0}});
  assert.deepStrictEqual(provider.draft, edited); // Old webview cannot overwrite a reopened problem.
  await provider.onDidReceiveMessage({command: 'run', token: provider.token, draft: edited});
  assert.deepStrictEqual(runs, [{file: 'solution.rs', input: '[1,2]\n3'}]);
  assert.strictEqual(saves, 1); assert.deepStrictEqual(opened, ['solution.rs']); assert.deepStrictEqual(results, ['result']);
  await provider.onDidReceiveMessage({command: 'run', token: provider.token, draft: {cases: [['bad', '3']], selected: 0}});
  assert.strictEqual(runs.length, 1); assert(provider.error.includes('valid JSON')); assert.strictEqual(provider.running, false);
  signedOut = true;
  await provider.onDidReceiveMessage({command: 'run', token: provider.token, draft: edited});
  assert.strictEqual(runs.length, 1); assert(provider.error.includes('Sign in'));
  signedOut = false;
  endpoint = 'leetcode-cn';
  await provider.onDidReceiveMessage({command: 'run', token: provider.token, draft: edited});
  assert.strictEqual(runs.length, 1); assert(provider.error.includes('endpoint changed'));
  await provider.show(true, problem, 'solution.rs');
  assert.strictEqual(provider.draft.cases.length, 3); // Endpoint-specific storage.
  await provider.onDidReceiveMessage({command: 'reset', token: provider.token});
  assert.strictEqual(provider.draft.cases.length, 3);
}
async function transportChecks() {
  const sandbox = {exports: {}, process, require(name) {
    if (name === 'child_process') return require(name);
    if (name === 'vscode') return {workspace: {getConfiguration: () => ({get: () => undefined})}};
    if (name === '../leetCodeChannel') return {leetCodeChannel: {append() {}}};
    throw new Error(name);
  }};
  vm.runInNewContext(fs.readFileSync(require.resolve('../out/src/utils/cpUtils'), 'utf8'), sandbox);
  const input = '"ERROR ` $() \\"quoted\\" \\n"\n9007199254740993';
  const response = await sandbox.exports.executeCommand(process.execPath,
    ['-e', 'process.stdin.pipe(process.stdout)'], {shell: false}, input);
  assert.strictEqual(response, input);
  await assert.rejects(sandbox.exports.executeCommand(process.execPath,
    ['-e', 'console.log("[ERROR] CLI failure")'], {shell: false}), /failed/);

  const cliPath = require.resolve('../node_modules/vsc-leetcode-cli/lib/commands/test.js');
  const cliSource = fs.readFileSync(cliPath, 'utf8');
  let receivedInput;
  const runner = {file: {exist: () => true, meta: () => ({id: '1'})},
    core: {getProblem: (_id, _translation, cb) => cb(null, {testable: true}),
      testProblem: problem => {receivedInput = problem.testcase;}}};
  vm.runInNewContext(cliSource.slice(cliSource.indexOf('function runTest('), cliSource.indexOf('cmd.handler =')) +
    '\nrunTest({filename: "solution.rs", i: true, testcase: ' + JSON.stringify(input) + '});', runner);
  assert.strictEqual(receivedInput, input); // Literal JSON escapes survive stdin.

  let payload;
  const command = {module: {exports: {}}, Buffer, require(name) {
    if (name === '../session') return {};
    if (name === '../core') return {getProblem: (_id, _translation, cb) => cb(null, {exampleTestcaseList: data.examples, templateMeta: data.metadata})};
    if (name === '../log') return {info: value => {payload = value;}};
    throw new Error(name);
  }};
  vm.runInNewContext(fs.readFileSync(require.resolve('../node_modules/vsc-leetcode-cli/lib/commands/cases.js'), 'utf8'), command);
  command.module.exports.handler({id: 1, T: true});
  assert.deepStrictEqual(parseCaseExamples(payload), examples);
}
transportChecks().then(providerChecks).then(() => console.log('Passed editable case tests: UI, validation, persistence, stale messages, solution binding, and Run All.'))
  .catch(error => {console.error(error); process.exitCode = 1;});
