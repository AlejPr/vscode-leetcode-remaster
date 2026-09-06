'use strict';
const core = require('../core');
const log = require('../log');
const session = require('../session');
module.exports = {
  command: 'cases <id>',
  desc: 'Fetch example cases and parameter metadata for the VS Code editor',
  builder: yargs => yargs.option('T', {type: 'boolean', default: false}),
  handler(argv) {
    session.argv = argv;
    core.getProblem(String(argv.id), !argv.T, (error, problem) => {
      if (error) return log.fail(error);
      const data = {examples: problem.exampleTestcaseList, metadata: problem.templateMeta || {}};
      log.info('LEETCODE_CASES:' + Buffer.from(JSON.stringify(data), 'utf8').toString('base64'));
    });
  }
};