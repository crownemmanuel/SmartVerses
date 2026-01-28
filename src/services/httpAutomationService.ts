import { ScheduleItemAutomation } from "../types/propresenter";

type HttpAutomation = Extract<ScheduleItemAutomation, { type: "http" }>;

export async function triggerHttpAutomation(
  automation: HttpAutomation
): Promise<{ ok: boolean; status?: number; error?: string }> {
  const payload = automation.payload?.trim();
  const headers: Record<string, string> = {};
  let body: string | undefined;

  if (payload && automation.method !== "GET") {
    headers["Content-Type"] = "application/json";
    body = payload;
  }

  try {
    const response = await fetch(automation.url, {
      method: automation.method,
      headers: Object.keys(headers).length > 0 ? headers : undefined,
      body,
    });
    return { ok: response.ok, status: response.status };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Request failed",
    };
  }
}
