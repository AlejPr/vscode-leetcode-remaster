# Project lock: preserve the customized LeetCode CLI

This repository intentionally contains local modifications in
`node_modules/vsc-leetcode-cli`. The customized CLI is tracked by Git, but its working copy is not
protected by package-lock.json, even though the CLI version is pinned.

## Required behavior for coding agents

- Do not reinstall, upgrade, remove, regenerate, or overwrite
  `node_modules/vsc-leetcode-cli` without explicit user authorization to replace
  the customized CLI.
- Do not run dependency-changing commands such as `npm ci`, `npm install`,
  `npm update`, `npm uninstall`, `npm audit fix`, or equivalent commands from
  other package managers without that authorization. Even installing an
  unrelated package can change the dependency tree.
- Do not delete or clean `node_modules`, run `git clean -xfd`, or enable an
  automated repair/install workflow that could replace the CLI.
- A general request to build, debug, test, or fix the extension does not
  authorize dependency reinstallation. If it is necessary, explain the risk
  and obtain explicit authorization first.
- Before an authorized reinstall, preserve the customized CLI outside
  `node_modules`, then restore and verify its changes afterward.
- Direct edits to the CLI requested by the user are allowed. Preserve existing
  customizations while making them.
- Compilation, lint, syntax checks, and packaging using already-installed
  tools are allowed. Do not install missing tools automatically.

## Customizations currently protected

- `lib/commands/cases.js`: exposes example lists and metadata for the editable panel.
- `lib/plugins/cache.js`: refreshes old cache records without example lists.
- `lib/commands/test.js`: accepts stdin input without altering JSON escapes and emits structured webview results.

- `lib/plugins/leetcode.js`: requests `exampleTestcaseList`, joins its entries
  for the runner, and retains/derives correctness from LeetCode's server verdict.
- `lib/commands/test.js`: reports Accepted or Wrong Answer from that verdict,
  preserving errors and using Finished when no verdict is available.

This is a repository instruction lock for coding agents, not an operating-system
or npm enforcement mechanism. Manually reinstalling dependencies can still erase
these edits.
