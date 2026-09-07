// Run after npm run compile: node test/test-case-editor.js
'use strict';
const assert = require('assert');
const fs = require('fs');
const vm = require('vm');
const {parseCaseExamples, parseCaseFile, validDraft, serializeCases, renderCaseEditor} = require('../out/src/webview/testCaseEditor');
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
assert.deepStrictEqual(parseCaseFile('\uFEFF[1,2]\r\n3\r\n[4,5]\r\n9\r\n', 2, false),
  {cases: [['[1,2]', '3'], ['[4,5]', '9']], selected: 0});
const preciseCases = [['9007199254740993', '"a\\nb"'], ['[1,2]', '"quoted \\"text\\""']];
assert.deepStrictEqual(parseCaseFile(serializeCases(preciseCases, false), 2, false).cases, preciseCases);
assert.deepStrictEqual(parseCaseFile('["Queue"]\n[[]]', 2, false).cases, [['["Queue"]', '[[]]']]);
assert.deepStrictEqual(parseCaseFile('1\n2\n3', 1, true).cases, [['1\n2\n3']]);
for (const invalid of ['', '   ', '[1,2]\n', '[1,2]\nbad', '1\n\n2\n3']) {
  assert.throws(() => parseCaseFile(invalid, 2, false));
}

// Exercise the editor script with a DOM harness, including edits and navigation.
function browser(html) {
  const elements = new Map();
  function element(tag) {
    return {tagName: tag, children: [], attributes: {}, dataset: {}, value: '', style: {}, scrollHeight: 42,
      set id(id) {this._id = id; elements.set(id, this);}, get id() {return this._id;},
      setAttribute(key, value) {this.attributes[key] = value;},
      appendChild(child) {this.children.push(child); child.parentElement = this;}, replaceChildren() {this.children = [];},
      focus() {this.focused = true;}};
  }
  const documentElement = element('html');
  const body = element('body');
  documentElement.appendChild(body);
  for (const id of ['tabs','fields','add','retry','error']) {
    const child = element('div'); child.id = id; body.appendChild(child);
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
  vm.runInNewContext(script, {document: {body, documentElement, getElementById: id => elements.get(id), createElement: element},
    ResizeObserver: class { constructor(callback) { resize = callback; } observe() {} },
    setTimeout: (callback, delay) => { timers.set(++timerId, {callback, due: now + delay}); return timerId; },
    clearTimeout: id => timers.delete(id),
    window: {addEventListener: (_event, callback) => {receiver = callback;}},
    acquireVsCodeApi: () => ({postMessage: message => messages.push(JSON.parse(JSON.stringify(message)))})});
  // VS Code reads context from the clicked element and its ancestors. Empty space targets html.
  function context(target = documentElement) {
    let result = {};
    for (let current = target; current; current = current.parentElement) {
      if (current.dataset.vscodeContext) result = {...JSON.parse(current.dataset.vscodeContext), ...result};
    }
    return result;
  }
  return {elements, messages, context, receive: data => receiver({data}),
    resize: width => resize([{contentRect: {width}}]),
    advance, flush: () => advance(2000)};
}
const draft = {cases: examples.cases, selected: 0};
const html = renderCaseEditor('token', examples.names, draft, '</script><img src=x>', false);
assert(!html.includes('</script><img src=x>'));
const visibleHtml = html.replace(/<!--[\s\S]*?-->/g, '');
for (const id of ['title', 'run', 'reset']) assert(!visibleHtml.includes('id="' + id + '"'));
const manifest = require('../package.json');
const menu = manifest.contributes.menus['webview/context'];
assert.deepStrictEqual(menu.map(item => item.command), ['leetcode.testCases.run', 'leetcode.testCases.reset', 'leetcode.testCases.import', 'leetcode.testCases.export']);
assert(menu.every(item => item.when === "webviewId == 'leetcode.testCases'"));
assert.deepStrictEqual(menu.map(item => item.group), ['navigation@1', 'navigation@2', 'navigation@3', 'navigation@4']);
assert(!JSON.stringify(manifest).includes('leetcode.testSolution'));
assert(!manifest.contributes.menus.commandPalette.some(item => item.command === 'leetcode.testCases.run'));
for (const name of ['explorer/context', 'leetcode.editorAction']) {
  assert(manifest.contributes.menus[name].some(item => item.command === 'leetcode.testCases.run'));
}
assert(fs.readFileSync(require.resolve('../out/src/codelens/CustomCodeLensProvider'), 'utf8').includes('leetcode.testCases.run'));
function enabled(command, context) {
  return command.enablement.split(' || ').some(term => term.split(' && ').every(key =>
    key.startsWith('!') ? !context[key.slice(1)] : context[key]));
}
assert(enabled(manifest.contributes.commands.find(item => item.command === 'leetcode.testCases.run'), {}));
const ui = browser(html);
for (const target of [undefined, ui.elements.get('fields'), ui.elements.get('input-0')]) {
  const context = ui.context(target);
  assert.strictEqual(context.leetcodeTestCasesToken, 'token');
  for (const item of menu) {
    const command = manifest.contributes.commands.find(command => command.command === item.command);
    assert(enabled(command, {...context, webviewId: 'leetcode.testCases'}),
      item.command + ' must be enabled over both empty space and inputs');
  }
}
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
ui.receive({command: 'run', token: 'token'});
assert.strictEqual(ui.messages.at(-1).command, 'run');
assert.strictEqual(ui.context().leetcodeTestCasesBusy, true);
ui.receive({command: 'status', token: 'token', busy: false, error: 'Invalid input'});
assert.strictEqual(ui.elements.get('error').textContent, 'Invalid input');
assert.strictEqual(ui.context().leetcodeTestCasesBusy, false);
ui.receive({command: 'saved', token: 'old-token'});
assert(!html.includes('id="saved"'));

// Menu commands use the live draft, cancel pending saves, and ignore stale or duplicate runs.
const menuUi = browser(html);
menuUi.elements.get('input-1').value = '42'; menuUi.elements.get('input-1').oninput();
menuUi.receive({command: 'run', token: 'old-token'});
assert.strictEqual(menuUi.messages.length, 0);
menuUi.receive({command: 'run', token: 'token'});
assert.strictEqual(menuUi.messages[0].draft.cases[0][1], '42');
menuUi.receive({command: 'run', token: 'token'});
menuUi.flush();
assert.strictEqual(menuUi.messages.length, 1);
menuUi.receive({command: 'status', token: 'token', busy: false});
menuUi.elements.get('input-1').value = '43'; menuUi.elements.get('input-1').oninput();
menuUi.receive({command: 'reset', token: 'token'});
menuUi.flush();
assert.deepStrictEqual(menuUi.messages.map(message => message.command), ['run', 'reset']);
const unloaded = browser(renderCaseEditor('token', [], {cases: [], selected: 0}, 'Loading failed', false));
assert.strictEqual(unloaded.context().leetcodeTestCasesReady, false);
unloaded.receive({command: 'run', token: 'token'});
unloaded.receive({command: 'reset', token: 'token'});
assert.strictEqual(unloaded.messages.length, 0);
for (const action of ['import', 'export']) {
  const fileUi = browser(html);
  fileUi.elements.get('input-1').value = '42'; fileUi.elements.get('input-1').oninput();
  fileUi.receive({command: action, token: 'old-token'});
  assert.strictEqual(fileUi.messages.length, 0);
  fileUi.receive({command: action, token: 'token'});
  assert.strictEqual(fileUi.messages.at(-1).command, action);
  assert.strictEqual(fileUi.messages.at(-1).draft.cases[0][1], '42');
  fileUi.flush();
  assert.deepStrictEqual(fileUi.messages.map(message => message.command), ['change', action]);
}

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
  const runs = [], results = [], opened = [], writes = [], errors = [];
  class Uri { constructor(fsPath) {this.fsPath = fsPath;} static file(fsPath) {return new Uri(fsPath);} }
  let selectedFiles, saveUri, fileData = '', readError, writeError, activeUri;
  const mockWindow = {
    get activeTextEditor() {return activeUri && {document: {uri: activeUri}};},
    showSaveDialog: async () => saveUri,
    showErrorMessage: text => errors.push(text)
  };
  let saves = 0;
  const sandbox = {exports: {}, Buffer, require(name) {
    if (name === 'crypto') return require('crypto');
    if (name === 'vscode') return {ViewColumn: {One: 1, Two: 2}, Uri, window: mockWindow, workspace: {
      getConfiguration: () => ({get: (_key, fallback) => fallback}),
      fs: {readFile: async () => {if (readError) throw readError; return Buffer.from(fileData);},
        writeFile: async (uri, bytes) => {if (writeError) throw writeError; writes.push({file: uri.fsPath, text: bytes.toString()});}},
      openTextDocument: async uri => {opened.push(uri.fsPath); return {isDirty: true, save: async () => {saves++; return true;}};}}};
    if (name === '../commands/plugin') return {getLeetCodeEndpoint: () => endpoint};
    if (name === '../commands/list') return {listProblems: async () => [{id: '2', name: 'Hidden solved problem'}]};
    if (name === '../explorer/explorerNodeManager') return {explorerNodeManager: {getNodeById: id => id === '1' ? {id, name: 'Two Sum'} : undefined}};
    if (name === '../utils/problemUtils') return {getNodeIdFromFile: async file => file === 'unknown.rs' ? '' : file === 'hidden.rs' ? '2' : '1'};
    if (name === '../utils/uiUtils') return {showFileSelectDialog: async () => typeof selectedFiles === 'function' ? selectedFiles() : selectedFiles};
    if (name === '../leetCodeExecutor') return {leetCodeExecutor: {getTestCases: async () => encode(data),
      testEditedCases: async (file, input) => {runs.push({file, input}); return 'result';}}};
    if (name === '../leetCodeManager') return {leetCodeManager: {getStatus: () => signedOut ? shared.UserStatus.SignedOut : shared.UserStatus.SignedIn}};
    if (name === '../shared') return shared;
    if (name === '../utils/settingUtils') return {shouldUseEndpointTranslation: () => false};
    if (name === './LeetCodeWebview') return {LeetCodeWebview: class {async showWebviewInternal() {
      this.panel = {reveal() {this.revealed = true;}, webview: {html: this.getWebviewContent(), postMessage() {}}};}}};
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
  const actionMessages = [];
  provider.panel.webview.postMessage = message => actionMessages.push(message);
  provider.executeCaseAction('run', {leetcodeTestCasesToken: 'old-token'});
  provider.executeCaseAction('run');
  assert.strictEqual(actionMessages.length, 0);
  for (const command of ['run', 'reset', 'import', 'export']) {
    provider.executeCaseAction(command, {leetcodeTestCasesToken: token});
    assert.strictEqual(actionMessages.at(-1).command, command);
    assert.strictEqual(actionMessages.at(-1).token, token);
  }
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

  // File actions round-trip the current draft, and failures/cancellation leave it intact.
  const fileAction = command => provider.onDidReceiveMessage({command, token: provider.token, draft: edited});
  saveUri = Uri.file('cases.txt');
  await fileAction('export');
  assert.deepStrictEqual(writes, [{file: 'cases.txt', text: '[1,2]\n3\n'}]);
  selectedFiles = [saveUri]; fileData = '[4,5]\n9\n[6,7]\n13\n';
  await fileAction('import');
  assert.strictEqual(provider.draft.cases.length, 2);
  assert.strictEqual(provider.draft.cases[1][1], '13');
  assert.deepStrictEqual(store.get(provider.key), JSON.parse(JSON.stringify(provider.draft)));
  fileData = 'bad'; await fileAction('import');
  assert.deepStrictEqual(provider.draft, edited);
  assert(provider.error.includes('Could not import'));
  readError = new Error('read failed'); await fileAction('import');
  assert.deepStrictEqual(provider.draft, edited); assert(provider.error.includes('read failed'));
  readError = undefined; writeError = new Error('write failed'); await fileAction('export');
  assert(provider.error.includes('write failed')); assert.strictEqual(writes.length, 1);
  writeError = undefined; saveUri = undefined; selectedFiles = undefined;
  await fileAction('export'); await fileAction('import');
  assert.deepStrictEqual(provider.draft, edited); assert.strictEqual(writes.length, 1);
  let finishDialog;
  selectedFiles = () => new Promise(resolve => {finishDialog = resolve;});
  const pendingImport = fileAction('import');
  while (!finishDialog) await Promise.resolve();
  await provider.show(true, problem, 'other.rs');
  const otherDraft = provider.draft;
  finishDialog([Uri.file('cases.txt')]); await pendingImport;
  assert.strictEqual(provider.draft, otherDraft);

  // Editor/CodeLens/Explorer runs use the target file; the open panel supplies unsaved edits.
  provider.panel.webview.postMessage = message => actionMessages.push(message);
  await provider.run(Uri.file('other.rs'));
  assert.strictEqual(actionMessages.at(-1).command, 'run');
  provider.panel.active = true;
  await provider.run();
  assert.strictEqual(actionMessages.at(-1).command, 'run');
  const beforeRun = runs.length;
  provider.panel = undefined;
  await provider.run(Uri.file('new-solution.rs'));
  assert.strictEqual(runs.length, beforeRun + 1);
  assert.strictEqual(runs.at(-1).file, 'new-solution.rs');
  provider.panel = undefined; activeUri = Uri.file('active-solution.rs');
  await provider.run();
  assert.strictEqual(runs.at(-1).file, 'active-solution.rs');
  await provider.run(Uri.file('unknown.rs'));
  assert(errors.at(-1).includes('Could not resolve'));
  await provider.run(Uri.file('hidden.rs'));
  assert.strictEqual(runs.at(-1).file, 'hidden.rs');
  activeUri = undefined; provider.panel = undefined;
  await provider.run(); assert(errors.at(-1).includes('Open a LeetCode solution'));
  await provider.useTestcase(Uri.file('solution.rs'), '[9,8]\n17');
  assert.deepStrictEqual(provider.draft.cases.at(-1), ['[9,8]', '17']);
  assert.strictEqual(provider.draft.selected, provider.draft.cases.length - 1);
  assert(provider.panel.revealed);
  const usedDraft = JSON.parse(JSON.stringify(provider.draft));
  await provider.useTestcase(Uri.file('solution.rs'), 'bad');
  assert.deepStrictEqual(provider.draft, usedDraft);
  assert(errors.at(-1).includes('Could not use'));
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

  const cliPath = require.resolve('../cli/lib/commands/test.js');
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
  vm.runInNewContext(fs.readFileSync(require.resolve('../cli/lib/commands/cases.js'), 'utf8'), command);
  command.module.exports.handler({id: 1, T: true});
  assert.deepStrictEqual(parseCaseExamples(payload), examples);
}
transportChecks().then(providerChecks).then(() => console.log('Passed editable case tests: UI, validation, persistence, stale messages, solution binding, and Run All.'))
  .catch(error => {console.error(error); process.exitCode = 1;});
