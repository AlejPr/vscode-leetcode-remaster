// Copyright (c) jdneo. All rights reserved.
// Licensed under the MIT license.

import { randomBytes } from "crypto";
import { commands, ViewColumn } from "vscode";
import { getLeetCodeEndpoint } from "../commands/plugin";
import { Endpoint, IProblem, ProblemState } from "../shared";
import { ILeetCodeWebviewOption, LeetCodeWebview } from "./LeetCodeWebview";
import { markdownEngine } from "./markdownEngine";

const problemMarker: string = "LEETCODE_PROBLEM:";

class LeetCodePreviewProvider extends LeetCodeWebview {
    protected readonly viewType: string = "leetcode.preview";
    private node: IProblem;
    private description: IDescription;
    private sideMode: boolean = false;

    public reveal(): void {
        if (this.panel) {
            this.panel.reveal(this.getWebviewOption().viewColumn, true);
        }
    }

    public isSideMode(): boolean {
        return this.sideMode;
    }

    public async show(descString: string, node: IProblem, isSideMode: boolean = false): Promise<void> {
        this.description = this.parseDescription(descString, node);
        this.node = node;
        this.sideMode = isSideMode;
        await this.showWebviewInternal();
    }

    protected getWebviewOption(): ILeetCodeWebviewOption {
        if (!this.sideMode) {
            return {
                title: `${this.node.name}: Preview`,
                viewColumn: ViewColumn.One,
            };
        }
        return {
            title: "Description",
            viewColumn: ViewColumn.Two,
            preserveFocus: true,
        };
    }

    protected getWebviewContent(): string {
        const nonce: string = randomBytes(16).toString("base64");
        const description: IDescription = this.description;
        const title: string = this.escapeHtml(description.title);
        const problemId: string = this.escapeHtml(description.id || this.node.id);
        const difficulty: string = this.escapeHtml(description.difficulty);
        const difficultyClass: string = this.getDifficultyClass(description.difficulty);
        const acceptanceRate: string = this.formatPercent(description.acceptanceRate);
        const isSolved: boolean = this.node.state === ProblemState.AC;
        const solvedStatus: string = isSolved ? `<span class="solved">Solved ${this.checkIcon()}</span>` : "";
        const codeButton: string = `<button class="code-button" id="solve">${this.codeIcon()}<span>Code Now</span></button>`;
        const headerActions: string = this.sideMode
            ? solvedStatus
            : `<div class="header-actions">${solvedStatus}${codeButton}</div>`;
        const codeButtonScript: string = this.sideMode ? "" : `
            const button = document.getElementById('solve');
            if (button) {
                button.addEventListener('click', () => vscode.postMessage({ command: 'ShowProblem' }));
            }
        `;

        return `<!DOCTYPE html>
            <html lang="en">
            <head>
                <meta charset="UTF-8">
                <meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src https: data:; media-src https:; script-src 'nonce-${nonce}'; style-src vscode-resource: 'unsafe-inline'; font-src vscode-resource: data:;">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                ${markdownEngine.getStyles()}
                <style>
                    :root { color-scheme: light dark; }
                    body {
                        box-sizing: border-box;
                        max-width: 100%;
                        margin: 0;
                        padding: 14px 10px 24px;
                        color: var(--vscode-editor-foreground);
                        background: var(--vscode-editor-background);
                        font-family: var(--vscode-font-family);
                        font-size: 14px;
                        line-height: 1.55;
                    }
                    *, *::before, *::after { box-sizing: inherit; }
                    .problem-header {
                        display: flex;
                        align-items: flex-start;
                        justify-content: space-between;
                        gap: 16px;
                        margin-bottom: 12px;
                    }
                    h1 {
                        margin: 0;
                        color: var(--vscode-editor-foreground);
                        font-size: 24px;
                        font-weight: 650;
                        line-height: 1.3;
                    }
                    .header-actions {
                        display: inline-flex;
                        flex: 0 0 auto;
                        align-items: center;
                        gap: 12px;
                    }
                    .solved {
                        display: inline-flex;
                        flex: 0 0 auto;
                        align-items: center;
                        gap: 5px;
                        color: var(--vscode-testing-iconPassed, #2cbb5d);
                        font-size: 13px;
                    }
                    .solved svg { width: 15px; height: 15px; }
                    .meta-row {
                        display: flex;
                        flex-wrap: wrap;
                        align-items: center;
                        gap: 7px;
                        margin-bottom: 18px;
                    }
                    .meta-pill {
                        display: inline-flex;
                        align-items: center;
                        gap: 5px;
                        min-height: 25px;
                        padding: 3px 9px;
                        border: 0;
                        border-radius: 13px;
                        color: var(--vscode-editor-foreground);
                        background: rgba(255, 255, 255, 0.09);
                        font-size: 12px;
                        line-height: 1;
                        text-decoration: none;
                    }
                    .meta-pill svg { width: 14px; height: 14px; }
                    .difficulty.easy { color: #00b8a3; }
                    .difficulty.medium { color: #ffc01e; }
                    .difficulty.hard { color: #ff375f; }
                    .leetcode-html {
                        overflow-wrap: anywhere;
                        color: var(--vscode-editor-foreground);
                    }
                    .leetcode-html p { margin: 0 0 16px; }
                    .leetcode-html strong {
                        color: var(--vscode-editor-foreground);
                        font-weight: 650;
                    }
                    .leetcode-html code {
                        padding: 1px 4px;
                        border: 1px solid var(--vscode-widget-border, rgba(128, 128, 128, 0.35));
                        border-radius: 5px;
                        color: var(--vscode-editor-foreground);
                        background: var(--vscode-textCodeBlock-background);
                        font-family: var(--vscode-editor-font-family, monospace);
                        font-size: 0.92em;
                        white-space: pre-wrap;
                    }
                    .leetcode-html pre {
                        max-width: 100%;
                        margin: 7px 0 17px;
                        padding: 0 0 0 16px;
                        border-left: 2px solid var(--vscode-widget-border, #454545);
                        background: transparent;
                        font-family: var(--vscode-editor-font-family, monospace);
                        line-height: 1.4;
                        white-space: pre-wrap;
                        overflow-wrap: anywhere;
                        overflow-x: auto;
                    }
                    .leetcode-html pre code {
                        padding: 0;
                        border: 0;
                        border-radius: 0;
                        background: transparent;
                    }
                    .leetcode-html ul,
                    .leetcode-html ol {
                        margin: 6px 0 18px;
                        padding-left: 20px;
                    }
                    .leetcode-html li { margin: 8px 0; }
                    .leetcode-html a { color: var(--vscode-textLink-foreground); }
                    .leetcode-html img,
                    .leetcode-html video {
                        display: block;
                        max-width: 100%;
                        height: auto !important;
                        margin: 16px auto;
                        object-fit: contain;
                    }
                    .leetcode-html table {
                        display: block;
                        max-width: 100%;
                        overflow-x: auto;
                        border-collapse: collapse;
                    }
                    .leetcode-html th,
                    .leetcode-html td {
                        padding: 6px 10px;
                        border: 1px solid var(--vscode-widget-border);
                    }
                    .problem-stats {
                        display: flex;
                        flex-wrap: wrap;
                        gap: 32px;
                        margin-top: 30px;
                        padding: 16px 0;
                        border-top: 1px solid var(--vscode-widget-border);
                        border-bottom: 1px solid var(--vscode-widget-border);
                    }
                    .stat {
                        display: flex;
                        align-items: baseline;
                        gap: 7px;
                        color: var(--vscode-descriptionForeground);
                    }
                    .stat strong {
                        color: var(--vscode-editor-foreground);
                        font-size: 17px;
                    }
                    .stat-detail { font-size: 12px; }
                    .section-details { border-bottom: 1px solid var(--vscode-widget-border); }
                    .section-details summary {
                        display: flex;
                        align-items: center;
                        gap: 9px;
                        padding: 15px 2px;
                        cursor: pointer;
                        color: var(--vscode-editor-foreground);
                        list-style: none;
                        user-select: none;
                    }
                    .section-details summary::-webkit-details-marker { display: none; }
                    .section-details .chevron {
                        display: inline-flex;
                        align-items: center;
                        justify-content: center;
                        width: 16px;
                        height: 16px;
                        margin-left: auto;
                        color: var(--vscode-descriptionForeground);
                        transition: transform 120ms ease;
                    }
                    .section-details .chevron svg { width: 14px; height: 14px; }
                    .section-details[open] .chevron { transform: rotate(180deg); }
                    .section-details summary svg {
                        width: 16px;
                        height: 16px;
                        color: var(--vscode-descriptionForeground);
                    }
                    .section-content {
                        display: flex;
                        flex-wrap: wrap;
                        gap: 7px;
                        padding: 0 2px 15px 27px;
                    }
                    .section-content a,
                    .section-content span {
                        padding: 4px 9px;
                        border-radius: 999px;
                        color: var(--vscode-descriptionForeground);
                        background: rgba(255, 255, 255, 0.09);
                        font-size: 12px;
                        text-decoration: none;
                    }
                    .empty-section { color: var(--vscode-descriptionForeground); }
                    .hint-content {
                        display: block;
                        padding: 0 27px 15px;
                    }
                    .hint-content > :last-child { margin-bottom: 0; }
                    .code-button {
                        display: inline-flex;
                        align-items: center;
                        justify-content: center;
                        gap: 6px;
                        min-height: 32px;
                        padding: 6px 13px;
                        border: 0;
                        border-radius: 7px;
                        color: #fff;
                        background: #2cbb5d;
                        font: inherit;
                        font-size: 13px;
                        font-weight: 600;
                        line-height: 1;
                        cursor: pointer;
                    }
                    .code-button svg { width: 15px; height: 15px; }
                    .code-button:hover { background: #27a952; }
                    .code-button:focus-visible {
                        outline: 1px solid var(--vscode-focusBorder);
                        outline-offset: 2px;
                    }
                    @media (max-width: 520px) {
                        body { padding-left: 8px; padding-right: 8px; }
                        h1 { font-size: 20px; }
                        .problem-stats { gap: 14px 24px; }
                    }
                </style>
            </head>
            <body>
                <header class="problem-header">
                    <h1>${problemId ? `${problemId}. ` : ""}${title}</h1>
                    ${headerActions}
                </header>
                <div class="meta-row">
                    <span class="meta-pill difficulty ${difficultyClass}">${difficulty}</span>
                    <a class="meta-pill" href="#topics">${this.tagIcon()} Topics</a>
                </div>
                <main class="problem-content leetcode-html">${description.body}</main>
                ${this.renderStats(description, acceptanceRate)}
                ${this.renderTopics(description.tags)}
                ${this.renderHints(description.hints)}
                <script nonce="${nonce}">
                    const vscode = acquireVsCodeApi();
                    ${codeButtonScript}
                </script>
            </body>
            </html>`;
    }

    protected onDidDisposeWebview(): void {
        super.onDidDisposeWebview();
        this.sideMode = false;
    }

    protected async onDidReceiveMessage(message: IWebViewMessage): Promise<void> {
        if (message.command === "ShowProblem") {
            await commands.executeCommand("leetcode.showProblem", this.node);
        }
    }

    private parseDescription(descString: string, problem: IProblem): IDescription {
        const markerLine: string | undefined = descString.split(/\r?\n/)
            .find((line: string) => line.startsWith(problemMarker));
        if (markerLine) {
            try {
                const value: any = JSON.parse(Buffer.from(markerLine.slice(problemMarker.length), "base64").toString("utf8"));
                if (value && value.version === 1 && typeof value.content === "string") {
                    return {
                        id: this.stringValue(value.id, problem.id),
                        title: this.stringValue(value.title, problem.name),
                        tags: this.stringArray(value.tags, problem.tags),
                        hints: this.stringArray(value.hints, []),
                        difficulty: this.stringValue(value.difficulty, problem.difficulty),
                        acceptanceRate: this.stringValue(value.acceptanceRate, problem.passRate),
                        totalAccepted: this.stringValue(value.totalAccepted, ""),
                        totalSubmissions: this.stringValue(value.totalSubmissions, ""),
                        body: value.content,
                    };
                }
            } catch (_error) {
                // Fall back to the original text output when a custom CLI returns a malformed marker.
            }
        }

        const lines: string[] = descString.split("\n");
        const difficultyLine: string = lines[9] || problem.difficulty;
        const difficultyMatch: RegExpMatchArray | null = difficultyLine.match(/^\*\s+([^()]+?)(?:\s+\(([^)]+)%\))?\s*$/);
        return {
            id: problem.id,
            title: problem.name,
            tags: problem.tags,
            hints: [],
            difficulty: difficultyMatch ? difficultyMatch[1].trim() : problem.difficulty,
            acceptanceRate: difficultyMatch && difficultyMatch[2] ? difficultyMatch[2] : problem.passRate,
            totalAccepted: this.valueAfterColon(lines[12]),
            totalSubmissions: this.valueAfterColon(lines[13]),
            body: lines.slice(17).join("\n").replace(/<pre>[\r\n]*([^]+?)[\r\n]*<\/pre>/g, "<pre><code>$1</code></pre>"),
        };
    }

    private renderStats(description: IDescription, acceptanceRate: string): string {
        if (!description.totalAccepted && !description.totalSubmissions && !acceptanceRate) {
            return "";
        }
        const accepted: string = this.escapeHtml(description.totalAccepted);
        const submissions: string = this.escapeHtml(description.totalSubmissions);
        return `<section class="problem-stats" aria-label="Problem statistics">
            <div class="stat"><span>Accepted</span><strong>${accepted || "—"}</strong>${submissions ? `<span class="stat-detail">/${submissions}</span>` : ""}</div>
            <div class="stat"><span>Acceptance Rate</span><strong>${this.escapeHtml(acceptanceRate) || "—"}</strong></div>
        </section>`;
    }

    private renderTopics(tags: string[]): string {
        const content: string = tags.length > 0
            ? tags.map((tag: string) => `<a href="${this.escapeAttribute(this.getTagLink(tag))}">${this.escapeHtml(tag)}</a>`).join("")
            : `<span class="empty-section">No topics listed</span>`;
        return `<details class="section-details" id="topics">
            <summary>${this.tagIcon()} <span>Topics</span><span class="chevron">${this.chevronIcon()}</span></summary>
            <div class="section-content">${content}</div>
        </details>`;
    }

    private renderHints(hints: string[]): string {
        return hints.map((hint: string, index: number) => `<details class="section-details hint-details">
            <summary>${this.hintIcon()} <span>Hint ${index + 1}</span><span class="chevron">${this.chevronIcon()}</span></summary>
            <div class="hint-content leetcode-html">${hint}</div>
        </details>`).join("");
    }

    private formatPercent(value: string): string {
        const trimmed: string = value.trim();
        if (!trimmed) {
            return "";
        }
        const numeric: number = Number(trimmed.replace(/%$/, ""));
        return Number.isFinite(numeric) ? `${numeric.toFixed(1)}%` : trimmed;
    }

    private getDifficultyClass(difficulty: string): string {
        const normalized: string = difficulty.toLowerCase().trim();
        return normalized === "easy" || normalized === "medium" || normalized === "hard" ? normalized : "";
    }

    private valueAfterColon(line: string | undefined): string {
        if (!line) {
            return "";
        }
        const index: number = line.indexOf(":");
        return index >= 0 ? line.slice(index + 1).trim() : "";
    }

    private stringValue(value: any, fallback: string): string {
        return typeof value === "string" || typeof value === "number" ? String(value) : fallback;
    }

    private stringArray(value: any, fallback: string[]): string[] {
        return Array.isArray(value) && value.every((item: any) => typeof item === "string") ? value : fallback;
    }

    private escapeHtml(value: string): string {
        return value.replace(/[&<>"']/g, (character: string) => ({
            "&": "&amp;",
            "<": "&lt;",
            ">": "&gt;",
            "\"": "&quot;",
            "'": "&#39;",
        }[character]!));
    }

    private escapeAttribute(value: string): string {
        return this.escapeHtml(value);
    }

    private getTagLink(tag: string): string {
        const endPoint: string = getLeetCodeEndpoint();
        if (endPoint === Endpoint.LeetCodeCN) {
            return `https://leetcode.cn/tag/${encodeURIComponent(tag)}?source=vscode`;
        }
        return `https://leetcode.com/tag/${encodeURIComponent(tag)}?source=vscode`;
    }

    private checkIcon(): string {
        return `<svg viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="6.5" fill="none" stroke="currentColor"/><path d="m4.7 8.1 2 2 4.6-4.7" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
    }

    private tagIcon(): string {
        return `<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M2.5 3.1v4.1l6.5 6.3 4.5-4.5-6.3-6.5H3.1a.6.6 0 0 0-.6.6Z" fill="none" stroke="currentColor" stroke-width="1.2"/><circle cx="5.3" cy="5.3" r="1" fill="currentColor"/></svg>`;
    }

    private codeIcon(): string {
        return `<svg viewBox="0 0 16 16" aria-hidden="true"><path d="m5.5 4-4 4 4 4M10.5 4l4 4-4 4M9.3 2.8 6.7 13.2" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
    }

    private hintIcon(): string {
        return `<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M5.5 11h5M6 13.5h4M8 1.8a4.2 4.2 0 0 0-2.7 7.4c.5.4.7.9.7 1.4h4c0-.5.2-1 .7-1.4A4.2 4.2 0 0 0 8 1.8Z" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
    }

    private chevronIcon(): string {
        return `<svg viewBox="0 0 16 16" aria-hidden="true"><path d="m4 6 4 4 4-4" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
    }
}

interface IDescription {
    id: string;
    title: string;
    tags: string[];
    hints: string[];
    difficulty: string;
    acceptanceRate: string;
    totalAccepted: string;
    totalSubmissions: string;
    body: string;
}

interface IWebViewMessage {
    command: string;
}

export const leetCodePreviewProvider: LeetCodePreviewProvider = new LeetCodePreviewProvider();
