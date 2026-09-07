// Licensed under the MIT license. All rights reserved.
'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.join(__dirname, '..');

function loadPreviewProvider() {
  const exports = {};
  class Webview {
    async showWebviewInternal() {
      this.html = this.getWebviewContent();
    }
    onDidDisposeWebview() {}
  }
  vm.runInNewContext(fs.readFileSync(path.join(root, 'out/src/webview/leetCodePreviewProvider.js'), 'utf8'), {
    exports,
    Buffer,
    encodeURIComponent,
    require(name) {
      if (name === 'crypto') return {randomBytes: () => ({toString: () => 'preview-nonce'})};
      if (name === 'vscode') return {commands: {executeCommand() {}}, ViewColumn: {One: 1, Two: 2}};
      if (name === '../commands/plugin') return {getLeetCodeEndpoint: () => 'leetcode'};
      if (name === '../shared') return {Endpoint: {LeetCode: 'leetcode', LeetCodeCN: 'leetcode-cn'}, ProblemState: {AC: 1}};
      if (name === './LeetCodeWebview') return {LeetCodeWebview: Webview};
      if (name === './markdownEngine') return {markdownEngine: {getStyles: () => ''}};
      throw new Error(`Unexpected module: ${name}`);
    },
  });
  return exports.leetCodePreviewProvider;
}

function emitCliPayload(webview) {
  const logs = [];
  const module = {exports: {}};
  const yellow = value => value;
  yellow.underline = value => value;
  vm.runInNewContext(fs.readFileSync(path.join(root, 'cli/lib/commands/show.js'), 'utf8'), {
    Buffer,
    module,
    require(name) {
      if (name === 'util') return require('util');
      if (name === 'underscore') return {sample: values => values[0]};
      if (name === 'child_process') return {};
      if (name === '../helper') return {badge: value => value, prettyLevel: value => value};
      if (name === '../file') return {};
      if (name === '../chalk') return {underline: value => value, yellow};
      if (name === '../icon') return {like: '*', empty: ''};
      if (name === '../log') return {
        info: value => logs.push(value),
        printf() {},
        fail: error => { throw error; },
        warn() {},
      };
      if (name === '../config') return {code: {lang: 'rust'}, sys: {langs: []}, file: {show: ''}};
      if (name === '../session') return {};
      if (name === '../core') return {
        filters: {},
        getProblem: (_keyword, _translate, callback) => callback(null, {
          id: 940,
          fid: '940',
          name: 'Distinct Subsequences II',
          link: 'https://leetcode.com/problems/distinct-subsequences-ii/description/',
          category: 'algorithms',
          level: 'Hard',
          percent: 51.1,
          likes: 1985,
          dislikes: 45,
          totalAC: '88,841',
          totalSubmit: '173.8K',
          tags: ['Principal', 'String', 'Dynamic Programming'],
          hints: ['<p>Track the last occurrence.</p>', '<img src="https://assets.leetcode.com/hint.gif">'],
          companies: ['Amazon'],
          templates: [],
          testable: false,
          desc: '<p>Problem body</p><img src="https://assets.leetcode.com/example.gif">',
        }),
      };
      throw new Error(`Unexpected module: ${name}`);
    },
  });
  module.exports.handler({keyword: '940', dontTranslate: false, gen: false, codeonly: false, extra: true, webview});
  return logs;
}

async function main() {
  const logs = emitCliPayload(true);
  const marker = logs.find(line => typeof line === 'string' && line.startsWith('LEETCODE_PROBLEM:'));
  assert(marker);
  const payload = JSON.parse(Buffer.from(marker.slice('LEETCODE_PROBLEM:'.length), 'base64').toString('utf8'));
  assert.strictEqual(payload.id, '940');
  assert.strictEqual(payload.totalAccepted, '88,841');
  assert(payload.content.includes('example.gif'));
  assert(!emitCliPayload(false).some(line => typeof line === 'string' && line.startsWith('LEETCODE_PROBLEM:')));
  const leetCodePlugin = fs.readFileSync(path.join(root, 'cli/lib/plugins/leetcode.js'), 'utf8');
  assert(leetCodePlugin.includes("'    topicTags {'"));
  assert(leetCodePlugin.includes("'    positionLevelTags {'"));
  assert(leetCodePlugin.includes(".map(tag => tag.name || tag.slug)"));
  const cachePlugin = fs.readFileSync(path.join(root, 'cli/lib/plugins/cache.js'), 'utf8');
  assert(cachePlugin.includes('_problem.tagMetadataVersion !== 2'));

  const provider = loadPreviewProvider();
  const node = {
    id: '940', name: 'Distinct Subsequences II', state: 1, difficulty: 'Hard', passRate: '51.1%',
    tags: [], companies: [], isFavorite: false, locked: false,
  };
  await provider.show(logs.join('\n'), node, true);
  const html = provider.html;
  assert(html.includes('<h1>940. Distinct Subsequences II</h1>'));
  assert(html.includes('class="solved">Solved'));
  assert(html.includes('class="meta-pill difficulty hard">Hard'));
  assert(html.includes('88,841'));
  assert(html.includes('173.8K'));
  assert(html.includes('51.1%'));
  assert(html.includes('Principal'));
  assert(html.includes('String'));
  assert(html.includes('Dynamic Programming'));
  assert(html.includes('Hint 1'));
  assert(html.includes('Hint 2'));
  assert(html.includes('Track the last occurrence.'));
  assert(html.includes('https://assets.leetcode.com/hint.gif'));
  assert(html.includes('class="hint-content leetcode-html"'));
  assert(html.includes('border-radius: 999px'));
  assert(!html.includes('Companies'));
  assert(!html.includes('Amazon'));
  assert(html.includes('class="chevron"'));
  assert(html.includes('d="m4 6 4 4 4-4"'));
  assert(html.includes('<img src="https://assets.leetcode.com/example.gif">'));
  assert(html.includes('img-src https: data:'));
  assert(html.includes('.leetcode-html img'));
  assert(!html.includes('Discussion'));
  assert(!html.includes('Similar Questions'));
  assert(!html.includes('Code Now'));

  await provider.show(logs.join('\n'), node, false);
  const previewHtml = provider.html;
  assert(previewHtml.includes('Code Now'));
  assert(previewHtml.includes('class="header-actions"'));
  assert(previewHtml.indexOf('class="solved">') < previewHtml.indexOf('class="code-button"'));
  assert(previewHtml.includes('background: #2cbb5d'));
  assert(!previewHtml.includes('position: fixed'));

  const legacy = [
    '[940] Distinct Subsequences II', '',
    'https://leetcode.com/problems/distinct-subsequences-ii/description/', '',
    'Tags: algorithms', '', 'Langs: rust', '', '* algorithms', '* Hard (44.23%)',
    '* Likes: 1985', '* Dislikes: 45', '* Total Accepted: 88,841', '* Total Submissions: 173.8K',
    '* Testcase Example: abc', '', '', '<p>Legacy body</p>',
  ].join('\n');
  await provider.show(legacy, node, true);
  assert(provider.html.includes('Legacy body'));
  assert(provider.html.includes('44.2%'));

  console.log('Passed problem-preview checks: structured CLI data, LeetCode layout, media, solved state, and legacy fallback.');
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
