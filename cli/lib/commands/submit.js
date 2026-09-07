'use strict';
var util = require('util');
var lodash = require('lodash');

var h = require('../helper');
var file = require('../file');
var chalk = require('../chalk');
var log = require('../log');
var core = require('../core');
var session = require('../session');

const cmd = {
  command: 'submit <filename>',
  aliases: ['push', 'commit'],
  desc:    'Submit code',
  builder: function(yargs) {
    return yargs
      .option('webview', { type: 'boolean', default: false, describe: 'Include structured Wrong Answer results for VS Code' })
      .positional('filename', {
        type:     'string',
        describe: 'Code file to submit',
        default:  ''
      })
      .example(chalk.yellow('leetcode submit 1.two-sum.cpp'), 'Submit code');
  }
};

function printResult(actual, k) {
  if (!actual.hasOwnProperty(k)) return;

  const v = actual[k] || '';
  const lines = Array.isArray(v) ? v : [v];
  for (let line of lines) {
    if (k !== 'state') line = lodash.startCase(k) + ': ' + line;
    log.info('  ' + h.prettyText(' ' + line, actual.ok));
  }
}

function printLine() {
  const args = Array.from(arguments);
  const actual = args.shift();
  const line = util.format.apply(util, args);
  log.info('  ' + h.prettyText(' ' + line, actual.ok));
}

cmd.handler = function(argv) {
  session.argv = argv;
  if (!file.exist(argv.filename))
    return log.fatal('File ' + argv.filename + ' not exist!');

  const meta = file.meta(argv.filename);

  // translation doesn't affect problem lookup
  core.getProblem(meta.id, true, function(e, problem) {
    if (e) return log.fail(e);

    problem.file = argv.filename;
    problem.lang = meta.lang;

    core.submitProblem(problem, function(e, results) {
      if (e) return log.fail(e);

      const result = results[0];

      printResult(result, 'state');
      printLine(result, '%d/%d cases passed (%s)',
          result.passed, result.total, result.runtime);

      if (result.ok) {
        session.updateStat('ac', 1);
        session.updateStat('ac.set', problem.fid);

        (function () {
          if (result.runtime_percentile)
            printLine(result, 'Your runtime beats %d %% of %s submissions',
                result.runtime_percentile.toFixed(2), result.lang);
          else
            return log.warn('Failed to get runtime percentile.');
          if (result.memory && result.memory_percentile)
            printLine(result, 'Your memory usage beats %d %% of %s submissions (%s)',
                result.memory_percentile.toFixed(2), result.lang, result.memory);
          else
            return log.warn('Failed to get memory percentile.');
        })();
        if (argv.webview) {
          const payload = {
            version: 1,
            source: 'submission',
            status: result.state,
            runtime: String(result.runtime || ''),
            memory: String(result.memory || ''),
            runtimePercentile: typeof result.runtime_percentile === 'number' ? result.runtime_percentile : null,
            memoryPercentile: typeof result.memory_percentile === 'number' ? result.memory_percentile : null,
            language: String(result.lang || problem.lang || ''),
            passed: result.passed,
            total: result.total,
            input: '',
            metadata: problem.templateMeta || {},
            outputs: [],
            expected: [],
            comparison: '',
            correct: true,
            errors: [],
            stdout: ''
          };
          log.info('LEETCODE_TEST_RESULT:' + Buffer.from(JSON.stringify(payload), 'utf8').toString('base64'));
        }

        // core.getSubmission({id: result.id}, function(e, submission) {
        //   if (e || !submission || !submission.distributionChart)
        //     return log.warn('Failed to get submission beat ratio.');

        //   const lang = submission.distributionChart.lang;
        //   const scores = submission.distributionChart.distribution;
        //   const myRuntime = parseFloat(result.runtime);

        //   let ratio = 0.0;
        //   for (let score of scores) {
        //     if (parseFloat(score[0]) > myRuntime)
        //       ratio += parseFloat(score[1]);
        //   }

        //   printLine(result, 'Your runtime beats %d %% of %s submissions',
        //       ratio.toFixed(2), lang);
        // });
      } else {
        result.testcase = result.testcase.slice(1, -1).replace(/\\n/g, '\n');
        printResult(result, 'error');
        printResult(result, 'testcase');
        printResult(result, 'answer');
        printResult(result, 'expected_answer');
        printResult(result, 'stdout');
        if (argv.webview && result.state === 'Wrong Answer') {
          const strings = value => Array.isArray(value) ? value.map(String) : [value == null ? '' : String(value)];
          const payload = {
            version: 1,
            source: 'submission',
            status: result.state,
            runtime: String(result.runtime || ''),
            passed: result.passed,
            total: result.total,
            input: String(result.raw_testcase || result.testcase),
            metadata: problem.templateMeta || {},
            outputs: strings(result.answer),
            expected: strings(result.expected_answer),
            comparison: '0',
            correct: false,
            errors: result.error,
            stdout: String(result.stdout || '')
          };
          log.info('LEETCODE_TEST_RESULT:' + Buffer.from(JSON.stringify(payload), 'utf8').toString('base64'));
        }
      }

      // update this problem status in local cache
      core.updateProblem(problem, {state: (result.ok ? 'ac' : 'notac')});
    });
  });
};

module.exports = cmd;
