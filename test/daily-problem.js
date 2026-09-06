// Run after npm run compile: node test/daily-problem.js
'use strict';
const assert = require('assert');
const fs = require('fs');
const vm = require('vm');
const path = require('path');
const root = path.join(__dirname, '..');
function moduleWithMocks(file, mocks, suffix = '', extras = {}) {
  const context = {exports: {}, require: name => mocks[name] || {}, ...extras};
  vm.runInNewContext(fs.readFileSync(path.join(root, 'out/src', file), 'utf8') + suffix, context);
  return context.exports;
}
async function main() {
  let endpoint = 'LeetCode';
  let response;
  let request;
  let failure;
  const query = moduleWithMocks('request/query-daily-problem.js', {
    '../commands/plugin': {getLeetCodeEndpoint: () => endpoint},
    '../shared': {Endpoint: {LeetCodeCN: 'LeetCodeCN'}, getUrl: () => endpoint},
    '../utils/httpUtils': {LcAxios: async (url, options) => {
      request = {url, options}; if (failure) throw failure; return {data: response};
    }},
  }).queryDailyProblem;
  response = {data: {activeDailyCodingChallengeQuestion: {question: {questionFrontendId: '1'}}}};
  assert.strictEqual(await query(), '1');
  assert(request.options.data.query.includes('activeDailyCodingChallengeQuestion'));
  endpoint = 'LeetCodeCN';
  response = {data: {todayRecord: [{question: {questionFrontendId: '2961', questionId: '9999'}}]}};
  assert.strictEqual(await query(), '2961');
  assert.strictEqual(request.url, endpoint);
  assert(request.options.data.query.includes('todayRecord'));
  for (response of [{}, {data: {todayRecord: []}}, {errors: [{message: 'error'}]}]) {
    await assert.rejects(query(), /LeetCode/);
  }
  failure = new Error('Request failed with status code 403');
  await assert.rejects(query(), /403/);

  let signedIn = true, cached, listCalls = 0, signIns = 0, queried = 0;
  const errors = [], opened = [];
  let problems = [{id: '2961', name: 'Daily'}];
  const show = moduleWithMocks('commands/show.js', {
    '../leetCodeManager': {leetCodeManager: {getUser: () => signedIn}},
    '../request/query-daily-problem': {queryDailyProblem: async () => { queried++; return '2961'; }},
    '../explorer/explorerNodeManager': {explorerNodeManager: {getNodeById: () => cached}},
    './list': {listProblems: async () => { listCalls++; return problems; }},
    '../utils/uiUtils': {promptForSignIn: () => signIns++},
    vscode: {window: {showErrorMessage: message => errors.push(message)}},
  }, '\nshowProblemInternal = openProblem;', {openProblem: async node => opened.push(node)});
  await show.pickDaily();
  assert.strictEqual(opened[0], problems[0]);
  assert.strictEqual(listCalls, 1);
  cached = problems[0];
  await show.pickDaily();
  assert.strictEqual(listCalls, 1);
  signedIn = false;
  await show.pickDaily();
  assert.strictEqual(signIns, 1);
  assert.strictEqual(queried, 2);
  signedIn = true; cached = undefined; problems = [];
  await show.pickDaily();
  assert(errors[0].includes('2961'));
  assert.strictEqual(opened.length, 2);
  let dailyId = '2', hideSolved = false, dailyFailure = false;
  const allProblems = [
    {id: '1', acceptanceRate: 30, companies: [], tags: []},
    {id: '2', acceptanceRate: 60, state: 'AC', companies: [], tags: []},
    {id: '3', acceptanceRate: 10, companies: [], tags: []},
  ];
  const manager = moduleWithMocks('explorer/explorerNodeManager.js', {
    '../commands/list': {listProblems: async () => allProblems},
    '../commands/plugin': {getSortingStrategy: () => 'ascending'},
    '../utils/settingUtils': {shouldHideSolvedProblem: () => hideSolved},
    '../shared': {ProblemState: {AC: 'AC'}, SortingStrategy: {AcceptanceRateAsc: 'ascending'}},
    '../request/query-daily-problem': {queryDailyProblem: async () => {
      if (dailyFailure) throw new Error('Unavailable'); return dailyId;
    }},
    '../leetCodeChannel': {leetCodeChannel: {appendLine() {}}},
    './LeetCodeNode': {LeetCodeNode: class { constructor(problem) { Object.assign(this, problem); } }},
  }).explorerNodeManager;
  const ids = () => Array.from(manager.getAllNodes(), node => node.id);
  await manager.refreshCache();
  assert.deepStrictEqual(ids(), ['2', '3', '1']);
  hideSolved = true;
  await manager.refreshCache();
  assert.deepStrictEqual(ids(), ['2', '3', '1']);
  assert.strictEqual(manager.getNodeById('2').id, '2');
  dailyId = '1';
  await manager.refreshCache();
  assert.deepStrictEqual(ids(), ['1', '3']);
  dailyFailure = true;
  await manager.refreshCache();
  assert.deepStrictEqual(ids(), ['3', '1']);
  manager.dispose();
  assert.deepStrictEqual(ids(), []);
  const manifest = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
  assert(manifest.activationEvents.includes('onCommand:leetcode.pickDaily'));
  assert(manifest.contributes.commands.some(command => command.command === 'leetcode.pickDaily'));
  assert(manifest.contributes.menus['view/title'].some(command => command.command === 'leetcode.pickDaily'));
  console.log('Passed daily picker checks: endpoints, displayed IDs, errors, sign-in, hidden solved cases, and command contribution.');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
