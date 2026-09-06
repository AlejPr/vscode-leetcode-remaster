// Licensed under the MIT license. All rights reserved.
import { randomBytes } from "crypto";
import { ExtensionContext, Memento, Uri, ViewColumn, workspace } from "vscode";
import { getLeetCodeEndpoint } from "../commands/plugin";
import { leetCodeExecutor } from "../leetCodeExecutor";
import { leetCodeManager } from "../leetCodeManager";
import { IProblem, UserStatus } from "../shared";
import { shouldUseEndpointTranslation } from "../utils/settingUtils";
import { ILeetCodeWebviewOption, LeetCodeWebview } from "./LeetCodeWebview";
import { leetCodeSubmissionProvider } from "./leetCodeSubmissionProvider";
import { ICaseDraft, ICaseExamples, parseCaseExamples, renderCaseEditor, serializeCases, validDraft } from "./testCaseEditor";

class LeetCodeTestCasesProvider extends LeetCodeWebview {
    protected readonly viewType: string = "leetcode.testCases";
    private sideMode: boolean = true;
    private storage: Memento;
    private token: string = "";
    private key: string = "";
    private endpoint: string = "";
    private problem: IProblem;
    private filePath: string = "";
    private examples: ICaseExamples = { names: [], cases: [], raw: true };
    private draft: ICaseDraft = { cases: [], selected: 0 };
    private error: string = "";
    private running: boolean = false;

    public initialize(context: ExtensionContext): void {
        this.storage = context.workspaceState;
    }

    public async show(isSideMode: boolean, problem: IProblem, filePath: string): Promise<void> {
        this.sideMode = isSideMode;
        this.problem = problem;
        this.filePath = filePath;
        this.endpoint = getLeetCodeEndpoint();
        this.key = `leetcode.testCases.v1.${this.endpoint}.${problem.id}`;
        const token: string = this.token = randomBytes(16).toString("hex");
        this.error = "";
        this.examples = { names: [], cases: [], raw: true };
        this.draft = { cases: [], selected: 0 };
        try {
            const result: string = await leetCodeExecutor.getTestCases(problem.id, shouldUseEndpointTranslation());
            if (token !== this.token) {
                return;
            }
            this.examples = parseCaseExamples(result);
            const stored: unknown = this.storage.get(this.key);
            this.draft = validDraft(stored, this.examples.names.length) ? stored : this.defaultDraft();
        } catch (error) {
            if (token !== this.token) {
                return;
            }
            this.error = `Could not load example cases. ${String(error)}`;
        }
        await this.showWebviewInternal();
    }

    protected getWebviewOption(): ILeetCodeWebviewOption {
        return { title: "Test Cases", viewColumn: this.sideMode ? ViewColumn.Two : ViewColumn.One, preserveFocus: true };
    }

    protected getWebviewContent(): string {
        return renderCaseEditor(this.token, this.examples.names, this.draft,
            `${this.problem.id}. ${this.problem.name}`, this.error, this.running);
    }

    protected async onDidReceiveMessage(message: any): Promise<void> {
        if (!message || message.token !== this.token) {
            return;
        }
        const token: string = this.token;
        if (message.command === "retry") {
            await this.show(this.sideMode, this.problem, this.filePath);
            return;
        }
        if (message.command === "reset") {
            this.draft = this.defaultDraft();
            await this.saveDraft(token);
            if (token === this.token && this.panel) {
                this.panel.webview.html = this.getWebviewContent();
            }
            return;
        }
        if (!["change", "run"].includes(message.command) || !validDraft(message.draft, this.examples.names.length)) {
            return;
        }
        this.draft = message.draft;
        await this.saveDraft(token);
        if (message.command !== "run" || token !== this.token || this.running) {
            return;
        }
        this.running = true;
        this.error = "";
        this.postStatus();
        try {
            if (getLeetCodeEndpoint() !== this.endpoint) {
                throw new Error("The LeetCode endpoint changed. Reopen this problem before running.");
            }
            if (leetCodeManager.getStatus() === UserStatus.SignedOut) {
                throw new Error("Sign in to LeetCode before running test cases.");
            }
            const input: string = serializeCases(message.draft.cases, this.examples.raw);
            const filePath: string = this.filePath;
            const document = await workspace.openTextDocument(Uri.file(filePath));
            if (document.isDirty && !await document.save()) {
                throw new Error("Save the solution file before running test cases.");
            }
            const result: string = await leetCodeExecutor.testEditedCases(filePath, input);
            if (token === this.token) {
                leetCodeSubmissionProvider.show(result);
            }
        } catch (error) {
            if (token === this.token) {
                this.error = String(error);
            }
        } finally {
            this.running = false;
            this.postStatus();
        }
    }

    private defaultDraft(): ICaseDraft {
        return { cases: this.examples.cases.length ? this.examples.cases.map((values: string[]) => values.slice()) :
            [this.examples.names.map(() => "")], selected: 0 };
    }

    private async saveDraft(token: string): Promise<void> {
        try {
            await this.storage.update(this.key, this.draft);
            if (token === this.token && this.panel) {
                this.panel.webview.postMessage({ command: "saved", token });
            }
        } catch (error) {
            if (token === this.token) {
                this.error = `Could not save test cases: ${String(error)}`;
                this.postStatus();
            }
        }
    }

    private postStatus(): void {
        if (this.panel) {
            this.panel.webview.postMessage({ command: "status", token: this.token, busy: this.running, error: this.error });
        }
    }
}

export const leetCodeTestCasesProvider: LeetCodeTestCasesProvider = new LeetCodeTestCasesProvider();
