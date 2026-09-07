// Licensed under the MIT license. All rights reserved.

import { createHash, randomBytes } from "crypto";

export interface ITestRun {
    version: number;
    source?: "submission";
    passed?: number;
    total?: number;
    status: string;
    runtime: string;
    input: string;
    metadata: { params?: Array<{ name: string }>; systemdesign?: boolean };
    outputs: string[];
    expected: string[];
    comparison: string;
    correct: boolean | null;
    errors: string[];
    stdout: string;
    stdoutByCase?: string[];
}

export interface ITestCaseResult {
    inputs: Array<{ name: string; value: string }>;
    output: string | undefined;
    expected: string | undefined;
    correct: boolean | null;
    stdout: string | undefined;
}

export function parseTestRun(raw: string): ITestRun | undefined {
    const match: RegExpExecArray | null = /^LEETCODE_TEST_RESULT:([A-Za-z0-9+/=]+)\r?$/m.exec(raw);
    if (!match) {
        return undefined;
    }
    try {
        const run: ITestRun = JSON.parse(Buffer.from(match[1], "base64").toString("utf8"));
        const strings = (value: any): boolean => Array.isArray(value) && value.every((item: any) => typeof item === "string");
        if (run.version !== 1 || typeof run.status !== "string" || typeof run.runtime !== "string" ||
            typeof run.input !== "string" || typeof run.stdout !== "string" || typeof run.comparison !== "string" ||
            !strings(run.outputs) || !strings(run.expected) || !strings(run.errors) ||
            (run.stdoutByCase !== undefined && !strings(run.stdoutByCase)) ||
            (run.correct !== null && typeof run.correct !== "boolean") || !run.metadata ||
            (run.source !== undefined && run.source !== "submission") ||
            (run.passed !== undefined && (!Number.isInteger(run.passed) || run.passed < 0)) ||
            (run.total !== undefined && (!Number.isInteger(run.total) || run.total < 0)) ||
            (run.passed !== undefined && run.total !== undefined && run.passed > run.total) ||
            (run.metadata.params !== undefined && (!Array.isArray(run.metadata.params) ||
                !run.metadata.params.every((param: { name: string }) => param && typeof param.name === "string")))) {
            return undefined;
        }
        return run;
    } catch {
        return undefined;
    }
}

export function getTestCases(run: ITestRun): ITestCaseResult[] {
    const names: string[] = run.metadata.systemdesign ? ["operations", "arguments"] :
        (run.metadata.params || []).map((param: { name: string }) => param.name);
    const lines: string[] = run.input.replace(/\r\n/g, "\n").replace(/\s+$/, "").split("\n");
    const comparison: string = /^[01]+$/.test(run.comparison) ? run.comparison : "";
    // Input groups define the cases. Result arrays can contain trailing empty entries.
    const answerCount = (answers: string[]): number => {
        let length: number = answers.length;
        while (length > 0 && answers[length - 1].trim() === "") {
            length--;
        }
        return length;
    };
    const count: number = names.length && run.input.trim() ? Math.ceil(lines.length / names.length) :
        comparison.length || Math.max(answerCount(run.outputs), answerCount(run.expected), 1);
    // When parameter metadata is absent, infer boundaries only if unambiguous.
    const width: number = names.length || (lines.length % count === 0 ? lines.length / count : 0);
    return Array.from({ length: count }, (_unused: unknown, index: number): ITestCaseResult => {
        const output: string | undefined = run.outputs[index];
        let correct: boolean | null = null;
        if (comparison[index] !== undefined) {
            correct = comparison[index] === "1";
        } else if (run.correct === true && output !== undefined) {
            correct = true;
        } else if (count === 1 && run.correct === false && output !== undefined) {
            correct = false;
        }
        return {
            inputs: width ? lines.slice(index * width, (index + 1) * width).map((value: string, param: number) => ({
                name: names[param] || `Argument ${param + 1}`, value,
            })) : [],
            output, expected: run.expected[index], correct, stdout: run.stdoutByCase?.[index],
        };
    });
}

function escapeHtml(value: string): string {
    return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

export function renderTestRun(run: ITestRun): string {
    const submission: boolean = run.source === "submission";
    const cases: ITestCaseResult[] = /^(Compile|Compilation) Error$/i.test(run.status.trim()) ? [] : getTestCases(run);
    const nonce: string = randomBytes(16).toString("hex");
    const identity: string = createHash("sha256").update(JSON.stringify(run)).digest("hex");
    const firstIncorrect: number = cases.findIndex((item: ITestCaseResult) => item.correct === false);
    const initial: number = Math.max(0, firstIncorrect);
    const statusClass: string = run.status === "Accepted" ? "passed" :
        /Wrong Answer|Error|Exceeded|Invalid/i.test(run.status) ? "failed" : "neutral";
    const runtime: string = /^\d+(\.\d+)?$/.test(run.runtime) ? `${run.runtime} ms` : run.runtime;
    const box = (label: string, value: string | undefined, valueClass: string = ""): string =>
        `<section class="field ${valueClass}"><h3>${escapeHtml(label)}</h3><pre>${escapeHtml(value === undefined ? "Not available" : value)}</pre></section>`;
    const tabs: string = cases.map((item: ITestCaseResult, index: number) => {
        const status: string = item.correct === true ? "Accepted" : item.correct === false ? "Wrong Answer" : "Verdict unavailable";
        const color: string = item.correct === true ? "passed" : item.correct === false ? "failed" : "neutral";
        const icon: string = item.correct === true ? "&#10003;" : item.correct === false ? "&#10007;" : "&#8212;";
        return `<button role="tab" id="case-${index}" aria-controls="panel-${index}" aria-selected="${index === initial}"
            tabindex="${index === initial ? 0 : -1}" data-case="${index}" aria-label="Case ${index + 1}: ${status}">
            <span class="${color}" aria-hidden="true">${icon}</span> Case ${index + 1}</button>`;
    }).join("");
    const panels: string = cases.map((item: ITestCaseResult, index: number) => `
        <div ${submission ? `class="submission-case"` : `role="tabpanel" id="panel-${index}" aria-labelledby="case-${index}" tabindex="0" ${index === initial ? "" : "hidden"}`}>
            <div class="field-heading"><h3>Input</h3>${submission ?
                `<button id="use-testcase" title="Copy this input to Test Cases">
                    <svg viewBox="0 0 16 16" aria-hidden="true" focusable="false">
                        <rect x="5" y="5" width="8" height="8" rx="1"/>
                        <path d="M3 11H2.5A1.5 1.5 0 0 1 1 9.5v-7A1.5 1.5 0 0 1 2.5 1h7A1.5 1.5 0 0 1 11 2.5V3"/>
                    </svg>Use Testcase</button>` : ""}</div>
            ${item.inputs.length ? item.inputs.map((input: { name: string; value: string }) =>
                `<div class="input"><div class="parameter">${escapeHtml(input.name)} =</div><pre>${escapeHtml(input.value)}</pre></div>`
            ).join("") : "<p>Individual inputs are not available.</p>"}
            ${box("Output", item.output, submission ? "output-wrong" : "")}${box("Expected", item.expected, submission ? "expected-correct" : "")}
            ${item.stdout ? box("Console output", item.stdout) : ""}
        </div>`).join("");
    return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'nonce-${nonce}'; script-src 'nonce-${nonce}';">
        <style nonce="${nonce}">
            body { padding: 20px; color: var(--vscode-foreground); background: var(--vscode-editor-background);
                font-family: var(--vscode-font-family); font-size: var(--vscode-font-size); }
            header { display: flex; align-items: baseline; gap: 18px; flex-wrap: wrap; margin-bottom: 20px; }
            h2 { margin: 0; font-size: 20px; font-weight: 600; }
            h3 { margin: 18px 0 8px; font-size: 12px; font-weight: 500; color: var(--vscode-descriptionForeground); }
            .passed { color: var(--vscode-testing-iconPassed, #2cbb5d); }
            .failed { color: var(--vscode-testing-iconFailed, #f85149); }
            .neutral, .runtime, .parameter { color: var(--vscode-descriptionForeground); }
            .runtime, .parameter { font-size: 12px; }
            .field-heading { display: flex; align-items: center; justify-content: space-between; margin-top: 18px; }
            .field-heading h3 { margin: 0 0 8px; }
            #use-testcase { display: inline-flex; align-items: center; gap: 6px; padding: 4px 8px;
                color: var(--vscode-foreground); }
            #use-testcase svg { width: 14px; height: 14px; fill: none; stroke: var(--vscode-descriptionForeground);
                stroke-width: 1.3; }
            .output-wrong pre { color: var(--vscode-testing-iconFailed, #f85149); }
            .expected-correct pre { color: var(--vscode-testing-iconPassed, #2cbb5d); }
            [role=tablist] { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 20px; }
            button { border: 0; border-radius: 7px; padding: 8px 14px; background: transparent;
                color: var(--vscode-descriptionForeground); font: inherit; cursor: pointer; }
            button span { margin-right: 6px; font-weight: bold; }
            button[aria-selected=true], button:hover { background: var(--vscode-toolbar-hoverBackground, #ffffff15);
                color: var(--vscode-foreground); }
            button[aria-selected=true] { font-weight: 600; }
            :focus-visible { outline: 1px solid var(--vscode-focusBorder); outline-offset: 2px; }
            .input, .field pre { background: var(--vscode-textCodeBlock-background, #ffffff0a); border-radius: 9px;
                padding: 12px 14px; margin: 0 0 8px; }
            pre { font-family: var(--vscode-editor-font-family); white-space: pre-wrap; overflow-wrap: anywhere; margin: 8px 0 0; }
            [hidden] { display: none !important; }
        </style></head><body>
        <header><h2 class="${statusClass}">${escapeHtml(run.status)}</h2><span class="runtime">${submission && run.passed !== undefined && run.total !== undefined ?
            `${run.passed} / ${run.total} testcases passed` : `Runtime: ${escapeHtml(runtime || "Not available")}`}</span></header>
        ${run.errors.length ? box("Error", run.errors.join("\n")) : ""}
        ${cases.length ? `${submission ? "" : `<div role="tablist" aria-label="Test cases">${tabs}</div>`}${panels}` : ""}
        ${run.stdout && !run.stdoutByCase?.length ?
            `<details><summary>Combined console output (case boundaries unavailable)</summary>${box("Console output", run.stdout)}</details>` : ""}
        <script nonce="${nonce}">
            const vscode = acquireVsCodeApi();
            const tabs = Array.from(document.querySelectorAll('[role="tab"]'));
            const panels = Array.from(document.querySelectorAll('[role="tabpanel"]'));
            const identity = '${identity}';
            const useTestcase = document.getElementById('use-testcase');
            if (useTestcase) useTestcase.addEventListener('click', () => vscode.postMessage({ command: 'useTestcase' }));
            function select(index, focus) {
                tabs.forEach((tab, i) => {
                    tab.setAttribute('aria-selected', String(i === index));
                    tab.tabIndex = i === index ? 0 : -1;
                    panels[i].hidden = i !== index;
                });
                if (focus) tabs[index].focus();
                vscode.setState({ identity, selected: index });
            }
            tabs.forEach((tab, index) => {
                tab.addEventListener('click', () => select(index, false));
                tab.addEventListener('keydown', event => {
                    let next = index;
                    if (event.key === 'ArrowRight') next = (index + 1) % tabs.length;
                    else if (event.key === 'ArrowLeft') next = (index + tabs.length - 1) % tabs.length;
                    else if (event.key === 'Home') next = 0;
                    else if (event.key === 'End') next = tabs.length - 1;
                    else return;
                    event.preventDefault();
                    select(next, true);
                });
            });
            const saved = vscode.getState();
            const firstIncorrect = ${run.status === "Wrong Answer" ? firstIncorrect : -1};
            if (firstIncorrect >= 0 && tabs.length) {
                select(firstIncorrect, true);
            } else if (saved && saved.identity === identity && Number.isInteger(saved.selected) && saved.selected >= 0 && saved.selected < tabs.length) {
                select(saved.selected, false);
            }
        </script></body></html>`;
}
