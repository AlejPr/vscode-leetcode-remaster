// Licensed under the MIT license. All rights reserved.
import { randomBytes } from "crypto";
import { ExtensionContext, Memento, Uri, ViewColumn, window, workspace } from "vscode";
import { getLeetCodeEndpoint } from "../commands/plugin";
import { listProblems } from "../commands/list";
import { explorerNodeManager } from "../explorer/explorerNodeManager";
import { leetCodeExecutor } from "../leetCodeExecutor";
import { leetCodeManager } from "../leetCodeManager";
import { IProblem, UserStatus } from "../shared";
import { shouldUseEndpointTranslation } from "../utils/settingUtils";
import { getNodeIdFromFile } from "../utils/problemUtils";
import { showFileSelectDialog } from "../utils/uiUtils";
import { ILeetCodeWebviewOption, LeetCodeWebview } from "./LeetCodeWebview";
import { leetCodeSubmissionProvider } from "./leetCodeSubmissionProvider";
import { ICaseDraft, ICaseExamples, parseCaseExamples, parseCaseFile, renderCaseEditor, serializeCases, validDraft } from "./testCaseEditor";

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

    public async run(input?: Uri | { leetcodeTestCasesToken?: string }): Promise<void> {
        if (input && !(input instanceof Uri)) {
            this.executeCaseAction("run", input);
            return;
        }
        if (!input && this.panel?.active) {
            this.executeCaseAction("run", { leetcodeTestCasesToken: this.token });
            return;
        }
        const uri: Uri | undefined = input || window.activeTextEditor?.document.uri;
        if (!uri) {
            window.showErrorMessage("Open a LeetCode solution before running test cases.");
            return;
        }
        try {
            if (this.panel && this.filePath === uri.fsPath && this.endpoint === getLeetCodeEndpoint()) {
                this.executeCaseAction("run", { leetcodeTestCasesToken: this.token });
                return;
            }
            const id: string = await getNodeIdFromFile(uri.fsPath);
            const problem: IProblem | undefined = explorerNodeManager.getNodeById(id) ||
                (await listProblems()).find((candidate: IProblem) => candidate.id === id);
            if (!problem) {
                throw new Error(`Could not resolve the problem for ${uri.fsPath}. Refresh the problem list and try again.`);
            }
            const endpoint: string = getLeetCodeEndpoint();
            await this.show(workspace.getConfiguration("leetcode").get<boolean>("enableSideMode", true), problem, uri.fsPath);
            if (this.filePath === uri.fsPath && this.endpoint === endpoint && this.examples.names.length) {
                await this.onDidReceiveMessage({ command: "run", token: this.token, draft: this.draft });
            }
        } catch (error) {
            window.showErrorMessage(String(error));
        }
    }

    public executeCaseAction(command: "run" | "reset" | "import" | "export", context?: { leetcodeTestCasesToken?: string }): void {
        if (this.panel && context?.leetcodeTestCasesToken === this.token) {
            this.panel.webview.postMessage({ command, token: this.token });
        }
    }

    public async useTestcase(uri: Uri, input: string): Promise<void> {
        try {
            if (!this.panel || this.filePath !== uri.fsPath || this.endpoint !== getLeetCodeEndpoint()) {
                const id: string = await getNodeIdFromFile(uri.fsPath);
                const problem: IProblem | undefined = explorerNodeManager.getNodeById(id) ||
                    (await listProblems()).find((candidate: IProblem) => candidate.id === id);
                if (!problem) {
                    throw new Error(`Could not resolve the problem for ${uri.fsPath}. Refresh the problem list and try again.`);
                }
                await this.show(workspace.getConfiguration("leetcode").get<boolean>("enableSideMode", true), problem, uri.fsPath);
            }
            const imported: ICaseDraft = parseCaseFile(input, this.examples.names.length, this.examples.raw);
            this.draft.cases.push(...imported.cases.map((values: string[]) => values.slice()));
            this.draft.selected = this.draft.cases.length - 1;
            await this.saveDraft(this.token);
            if (this.panel) {
                this.panel.webview.html = this.getWebviewContent();
                this.panel.reveal(this.getWebviewOption().viewColumn);
            }
        } catch (error) {
            window.showErrorMessage(`Could not use the failing test case: ${String(error)}`);
        }
    }

    protected getWebviewOption(): ILeetCodeWebviewOption {
        return { title: "Test Cases", viewColumn: this.sideMode ? ViewColumn.Two : ViewColumn.One, preserveFocus: true };
    }

    protected getWebviewContent(): string {
        return renderCaseEditor(this.token, this.examples.names, this.draft, this.error, this.running);
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
        if (!["change", "run", "import", "export"].includes(message.command) || !validDraft(message.draft, this.examples.names.length)) {
            return;
        }
        this.draft = message.draft;
        await this.saveDraft(token);
        if (token !== this.token) {
            return;
        }
        if (message.command === "import" || message.command === "export") {
            try {
                if (message.command === "export") {
                    const data: string = serializeCases(message.draft.cases, this.examples.raw) + "\n";
                    const uri: Uri | undefined = await window.showSaveDialog({
                        defaultUri: Uri.file(this.filePath + ".cases.txt"),
                        saveLabel: "Export Test Cases",
                        filters: { "Text files": ["txt"] },
                    });
                    if (uri && token === this.token) {
                        await workspace.fs.writeFile(uri, Buffer.from(data, "utf8"));
                    }
                } else {
                    const files: Uri[] | undefined = await showFileSelectDialog(this.filePath);
                    if (!files?.length || token !== this.token) {
                        return;
                    }
                    const input: Uint8Array = await workspace.fs.readFile(files[0]);
                    if (token !== this.token) {
                        return;
                    }
                    const draft: ICaseDraft = parseCaseFile(Buffer.from(input).toString("utf8"), this.examples.names.length, this.examples.raw);
                    this.draft = draft;
                    this.error = "";
                    await this.saveDraft(token);
                    if (token === this.token && this.panel) {
                        this.panel.webview.html = this.getWebviewContent();
                    }
                }
            } catch (error) {
                if (token === this.token) {
                    this.error = `Could not ${message.command} test cases: ${String(error)}`;
                    this.postStatus();
                }
            }
            return;
        }
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
