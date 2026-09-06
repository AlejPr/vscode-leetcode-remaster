// Licensed under the MIT license. All rights reserved.
import { parseTestRun } from "../webview/testResults";

export async function testCommandResult(command: Promise<string>): Promise<string> {
    try {
        return await command;
    } catch (error) {
        const output: unknown = error && typeof error === "object" && "result" in error ?
            (error as { result?: unknown }).result : undefined;
        if (typeof output === "string") {
            const plain: string = output.replace(/\u001b\[[0-9;]*m/g, "");
            if (/^\s*\[ERROR\].*session expired/im.test(plain)) {
                throw new Error("Your LeetCode session expired. Run LeetCode: Sign In again, then retry. Your edited test cases are saved.");
            }
            // A completed judge result is still useful even if the CLI reports failure.
            if (parseTestRun(output)) {
                return output;
            }
            const failure: RegExpExecArray | null = /^\s*\[ERROR\]\s*(.+)$/m.exec(plain);
            if (failure) {
                throw new Error(failure[1]);
            }
        }
        throw error;
    }
}
