// Licensed under the MIT license. All rights reserved.
import { getLeetCodeEndpoint } from "../commands/plugin";
import { Endpoint, getUrl } from "../shared";
import { LcAxios } from "../utils/httpUtils";

export async function queryDailyProblem(): Promise<string> {
    const isChina: boolean = getLeetCodeEndpoint() === Endpoint.LeetCodeCN;
    const field: string = isChina ? "todayRecord" : "activeDailyCodingChallengeQuestion";
    const response = await LcAxios(getUrl("graphql"), {
        method: "POST",
        timeout: 15000,
        data: {
            query: `query questionOfToday { ${field} { question { questionFrontendId } } }`,
            variables: {},
            operationName: "questionOfToday",
        },
    });
    if (response.data?.errors?.length) {
        throw new Error("LeetCode could not return today's problem.");
    }
    const record = response.data?.data?.[field];
    const id = (isChina ? record?.[0] : record)?.question?.questionFrontendId;
    if (typeof id !== "string" || !id.trim()) {
        throw new Error("LeetCode returned no daily problem.");
    }
    return id;
}
