// Licensed under the MIT license. All rights reserved.
import { randomBytes } from "crypto";

export interface ICaseDraft {
    cases: string[][];
    selected: number;
}
export interface ICaseExamples {
    names: string[];
    cases: string[][];
    raw: boolean;
}

export function parseCaseExamples(output: string): ICaseExamples {
    const match: RegExpExecArray | null = /^LEETCODE_CASES:([A-Za-z0-9+/=]+)\r?$/m.exec(output);
    if (!match) {
        throw new Error("The CLI did not return example cases.");
    }
    const data = JSON.parse(Buffer.from(match[1], "base64").toString("utf8"));
    if (!Array.isArray(data.examples) || !data.examples.every((entry: unknown) => typeof entry === "string")) {
        throw new Error("The example cases have an invalid format.");
    }
    const metadata = data.metadata || {};
    const names: string[] = metadata.systemdesign ? ["operations", "arguments"] :
        Array.isArray(metadata.params) ? metadata.params.map((param: { name: string }) => param.name) : [];
    const raw: boolean = !names.length || names.some((name: unknown) => typeof name !== "string");
    const cases: string[][] = data.examples.map((entry: string) => raw ? [entry] : entry.trim().split(/\r?\n/));
    if (!raw && cases.some((values: string[]) => values.length !== names.length)) {
        return { names: ["Input"], cases: data.examples.map((entry: string) => [entry]), raw: true };
    }
    return { names: raw ? ["Input"] : names, cases, raw };
}

export function validDraft(value: any, width: number): value is ICaseDraft {
    return value && Array.isArray(value.cases) && value.cases.length > 0 &&
        value.cases.every((entry: any) => Array.isArray(entry) && entry.length === width &&
            entry.every((input: any) => typeof input === "string")) &&
        Number.isInteger(value.selected) && value.selected >= 0 && value.selected < value.cases.length;
}

export function serializeCases(cases: string[][], raw: boolean): string {
    if (!cases.length) {
        throw new Error("Add a test case before running.");
    }
    return cases.map((values: string[], index: number) => values.map((value: string, param: number) => {
        const entries: string[] = raw ? value.trim().split(/\r?\n/) : [value];
        return entries.map((entry: string) => {
            try {
                JSON.parse(entry);
            } catch {
                throw new Error(`Case ${index + 1}, input ${param + 1}: enter a valid JSON value (put strings in double quotes).`);
            }
            // Validate without re-serializing numbers, which could lose integer precision.
            return entry.trim().replace(/"(?:\\.|[^"\\])*"|\s+/g, (part: string) => part.startsWith('"') ? part : "");
        }).join("\n");
    }).join("\n")).join("\n");
}

export function parseCaseFile(input: string, width: number, raw: boolean): ICaseDraft {
    const text: string = input.trim();
    if (!text || width < 1) {
        throw new Error("The test case file must contain JSON inputs for this problem.");
    }
    const lines: string[] = text.split(/\r?\n/);
    if (!raw && lines.length % width !== 0) {
        throw new Error(`Each test case needs ${width} inputs, one JSON value per line.`);
    }
    const cases: string[][] = [];
    if (raw) {
        // ponytail: without parameter metadata, retain the file as one raw case; split when metadata is available.
        cases.push([text]);
    } else {
        for (let index: number = 0; index < lines.length; index += width) {
            cases.push(lines.slice(index, index + width));
        }
    }
    serializeCases(cases, raw);
    return { cases, selected: 0 };
}

export function renderCaseEditor(token: string, names: string[], draft: ICaseDraft, error: string, busy: boolean): string {
    const nonce: string = randomBytes(16).toString("hex");
    const data: string = JSON.stringify({token, names, draft, error, busy}).replace(/</g, "\\u003c")
        .replace(/\u2028/g, "\\u2028").replace(/\u2029/g, "\\u2029");
    return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'nonce-${nonce}'; script-src 'nonce-${nonce}';">
        <style nonce="${nonce}">
            body { padding: 20px; color: var(--vscode-foreground); background: var(--vscode-editor-background);
                font-family: var(--vscode-font-family); font-size: var(--vscode-font-size); }
            .tabs { display: flex; align-items: center; flex-wrap: wrap; gap: 8px; margin: 12px 0 22px; }
            #tabs { display: contents; }
            .case-tab { position: relative; }
            .case-close { position: absolute; top: -4px; right: -4px; width: 14px; height: 14px;
                padding: 0; border-radius: 50%;
                background: #666; color: #eee;
                opacity: 0; pointer-events: none; }
            .case-close::before, .case-close::after { content: ''; position: absolute;
                left: 50%; top: 50%; width: 7px; height: 1px; background: currentColor;
                transform: translate(-50%, -50%) rotate(45deg); }
            .case-close::after { transform: translate(-50%, -50%) rotate(-45deg); }
            .case-tab:hover .case-close, .case-tab:focus-within .case-close { opacity: 1; pointer-events: auto; }
            .case-close:hover { background: #808080; color: #fff; }
            button { font: inherit; border: 0; border-radius: 7px; padding: 8px 13px; cursor: pointer;
                background: transparent; color: var(--vscode-descriptionForeground); }
            button:hover, button[aria-selected=true] { background: var(--vscode-toolbar-hoverBackground, #ffffff15); color: var(--vscode-foreground); }
            button[role=tab] { font-weight: 600; }
            .actions { display: flex; align-items: center; gap: 8px; }
            #reset, #run { display: inline-flex; align-items: center; justify-content: center;
                width: 34px; height: 32px; padding: 0; }
            #reset svg, #run svg { width: 18px; height: 18px; }
            #run { background: #238636; color: #fff; }
            #run:hover { background: #2ea043; }
            button:disabled { opacity: .5; cursor: default; }
            #add { position: relative; width: 32px; height: 32px; padding: 0; background: transparent; }
            #add:hover { background: transparent; }
            #add::before, #add::after { content: ''; position: absolute; left: 50%; top: 50%;
                width: 12px; height: 2px; background: currentColor; transform: translate(-50%, -50%); }
            #add::after { transform: translate(-50%, -50%) rotate(90deg); }
            label { display: block; margin: 18px 0 8px; font-size: 12px; color: var(--vscode-descriptionForeground); }
            textarea { box-sizing: border-box; width: 100%; min-height: 44px; resize: none; overflow: hidden; border-radius: 9px;
                border: 1px solid transparent; padding: 12px 14px; font: inherit; font-family: var(--vscode-editor-font-family);
                color: var(--vscode-input-foreground); background: var(--vscode-textCodeBlock-background, var(--vscode-input-background)); }
            :focus-visible { outline: 1px solid var(--vscode-focusBorder); outline-offset: 2px; }
            #error { color: var(--vscode-errorForeground); white-space: pre-wrap; }
            [hidden] { display: none !important; }
        </style></head><body>
        <button id="retry" hidden>Retry loading</button>
        <!-- Toolbar actions moved to the native webview context menu.
        <div class="actions">
            <button id="reset" aria-label="Reset examples" title="Reset examples">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">
                    <path d="M3 10a9 9 0 1 1 2 8M3 4v6h6"/>
                </svg>
            </button>
            <button id="run" aria-label="Run all test cases" title="Run all test cases">
                <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" focusable="false"><path d="M8 4l12 8-12 8z"/></svg>
            </button>
        </div> -->
        <p id="error" role="alert" hidden></p>
        <div class="tabs"><div id="tabs" role="tablist" aria-label="Test cases"></div><button id="add" aria-label="Clone selected test case" title="Clone selected test case"></button></div>
        <div id="fields" role="tabpanel"></div>
        <script nonce="${nonce}">
            const vscode = acquireVsCodeApi();
            const config = ${data};
            let draft = config.draft;
            let busy = config.busy;
            let saveTimer;
            let lastSentCases = JSON.stringify(draft.cases);
            const byId = id => document.getElementById(id);
            function send(command) { vscode.postMessage({ command, token: config.token, draft }); }
            function save() {
                clearTimeout(saveTimer); saveTimer = undefined;
                const cases = JSON.stringify(draft.cases);
                if (cases === lastSentCases) return;
                lastSentCases = cases;
                send('change');
            }
            function scheduleSave() {
                clearTimeout(saveTimer);
                saveTimer = setTimeout(save, 2000);
            }
            function fitInput(input) {
                input.style.height = 'auto';
                input.style.height = (input.scrollHeight + 2) + 'px';
            }
            function setError(text) { byId('error').textContent = text; byId('error').hidden = !text; }
            function updateButtons() {
                document.documentElement.dataset.vscodeContext = JSON.stringify({
                    leetcodeTestCasesToken: config.token,
                    leetcodeTestCasesReady: !!config.names.length,
                    leetcodeTestCasesBusy: busy
                });
                byId('add').disabled = !config.names.length;
                byId('retry').hidden = !!config.names.length;
            }
            function render(focusTab) {
                byId('tabs').replaceChildren(); byId('fields').replaceChildren();
                draft.cases.forEach((values, index) => {
                    const tab = document.createElement('div');
                    tab.className = 'case-tab'; tab.setAttribute('role', 'presentation');
                    const button = document.createElement('button');
                    button.textContent = 'Case ' + (index + 1); button.id = 'case-' + index;
                    button.setAttribute('role', 'tab'); button.setAttribute('aria-controls', 'fields');
                    button.setAttribute('aria-selected', String(index === draft.selected));
                    button.tabIndex = index === draft.selected ? 0 : -1;
                    button.onclick = () => { draft.selected = index; render(true); };
                    button.onkeydown = event => {
                        let next = index;
                        if (event.key === 'ArrowRight') next = (index + 1) % draft.cases.length;
                        else if (event.key === 'ArrowLeft') next = (index + draft.cases.length - 1) % draft.cases.length;
                        else if (event.key === 'Home') next = 0;
                        else if (event.key === 'End') next = draft.cases.length - 1;
                        else return;
                        event.preventDefault(); draft.selected = next; render(true);
                    };
                    tab.appendChild(button);
                    const close = document.createElement('button');
                    close.className = 'case-close'; close.id = 'close-case-' + index;
                    close.setAttribute('aria-label', 'Delete Case ' + (index + 1));
                    close.title = 'Delete Case ' + (index + 1); close.hidden = draft.cases.length <= 1;
                    close.onclick = () => {
                        if (draft.cases.length <= 1) return;
                        draft.cases.splice(index, 1);
                        if (index < draft.selected) draft.selected--;
                        else draft.selected = Math.min(draft.selected, draft.cases.length - 1);
                        render(true); save();
                    };
                    tab.appendChild(close); byId('tabs').appendChild(tab);
                });
                byId('fields').setAttribute('aria-labelledby', 'case-' + draft.selected);
                const current = draft.cases[draft.selected] || [];
                config.names.forEach((name, index) => {
                    const label = document.createElement('label'); label.htmlFor = 'input-' + index; label.textContent = name + ' =';
                    const input = document.createElement('textarea'); input.id = label.htmlFor; input.spellcheck = false;
                    input.value = current[index] || ''; input.rows = 1;
                    input.oninput = () => {
                        fitInput(input);
                        if (draft.cases[draft.selected][index] === input.value) return;
                        draft.cases[draft.selected][index] = input.value; scheduleSave();
                    };
                    byId('fields').appendChild(label); byId('fields').appendChild(input);
                    fitInput(input);
                });
                updateButtons(); if (focusTab && byId('case-' + draft.selected)) byId('case-' + draft.selected).focus();
            }
            byId('add').onclick = () => { draft.cases.push([...draft.cases[draft.selected]]); draft.selected = draft.cases.length - 1; render(true); save(); };
            function runCases() {
                if (busy || !config.names.length) return;
                clearTimeout(saveTimer); saveTimer = undefined; lastSentCases = JSON.stringify(draft.cases);
                busy = true; updateButtons(); setError(''); send('run');
            }
            function resetCases() {
                if (!config.names.length) return;
                clearTimeout(saveTimer); saveTimer = undefined; send('reset');
            }
            byId('retry').onclick = () => send('retry');
            window.addEventListener('message', event => {
                const message = event.data; if (message.token !== config.token) return;
                if (message.command === 'run') runCases();
                if (message.command === 'reset') resetCases();
                if (['import', 'export'].includes(message.command) && config.names.length) {
                    save(); send(message.command);
                }
                if (message.command === 'status') { busy = message.busy; setError(message.error || ''); updateButtons(); }
            });
            setError(config.error); render(false);
            let fieldsWidth;
            const resizeObserver = new ResizeObserver(entries => {
                const width = entries[0].contentRect.width;
                if (!width || width === fieldsWidth) return;
                fieldsWidth = width;
                config.names.forEach((_name, index) => fitInput(byId('input-' + index)));
            });
            resizeObserver.observe(byId('fields'));
        </script></body></html>`;
}
