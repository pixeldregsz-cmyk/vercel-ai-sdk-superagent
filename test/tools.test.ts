/**
 * Unit tests for the Vercel AI SDK SuperAgent integration.
 * All HTTP is mocked — zero credits and zero network needed.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  SuperAgentClient,
  SuperAgentAPIError,
  DEFAULT_BASE_URL,
  BROWSER_USER_AGENT,
} from "../src/client.js";
import { createSuperAgentTools, MEMORY_SERVICE_ID } from "../src/tools.js";

const DUMMY_KEY = "hmos_dummy_test_key";

interface RecordedCall {
  url: string;
  init: RequestInit;
}

function mockFetch(handler: (call: RecordedCall) => unknown) {
  const calls: RecordedCall[] = [];
  const fetchImpl = (async (url: string, init: RequestInit = {}) => {
    const call = { url, init };
    calls.push(call);
    const payload = handler(call);
    return new Response(JSON.stringify(payload), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }) as typeof fetch;
  return { fetchImpl, calls };
}

function errorFetch(status: number, body: unknown) {
  return (async () => {
    return new Response(JSON.stringify(body), {
      status,
      headers: { "Content-Type": "application/json" },
    });
  }) as typeof fetch;
}

const TOOL_OPTIONS = { toolCallId: "test-call", messages: [] as never[] };

beforeEach(() => {
  vi.unstubAllEnvs();
});

describe("SuperAgentClient", () => {
  it("requires an API key", () => {
    expect(() => new SuperAgentClient({ apiKey: "" })).toThrow(/API key is required/);
  });

  it("sends Bearer auth, browser UA and Accept headers", async () => {
    const { fetchImpl, calls } = mockFetch(() => ({ services: [] }));
    const client = new SuperAgentClient({ apiKey: DUMMY_KEY, fetchImpl });
    await client.listServices();
    const headers = calls[0].init.headers as Record<string, string>;
    expect(headers.Authorization).toBe(`Bearer ${DUMMY_KEY}`);
    expect(headers["User-Agent"]).toBe(BROWSER_USER_AGENT);
    expect(headers.Accept).toBe("application/json");
    expect(calls[0].url).toBe(`${DEFAULT_BASE_URL}/services`);
  });

  it("auto-generates a unique Idempotency-Key per mutation matching the API pattern", async () => {
    const { fetchImpl, calls } = mockFetch(() => ({ ok: true }));
    const client = new SuperAgentClient({ apiKey: DUMMY_KEY, fetchImpl });
    await client.invoke("svc", { operationId: "op.a", input: {} });
    await client.invoke("svc", { operationId: "op.a", input: {} });
    const keys = calls.map(
      (c) => (c.init.headers as Record<string, string>)["Idempotency-Key"]
    );
    expect(keys).toHaveLength(2);
    for (const key of keys) {
      expect(key).toMatch(/^[A-Za-z0-9:._-]+$/);
      expect(key).toHaveLength(32); // uuid hex without dashes
    }
    expect(keys[0]).not.toBe(keys[1]);
  });

  it("honors a caller-supplied idempotency key", async () => {
    const { fetchImpl, calls } = mockFetch(() => ({ ok: true }));
    const client = new SuperAgentClient({ apiKey: DUMMY_KEY, fetchImpl });
    await client.invoke("svc", { operationId: "op.a", idempotencyKey: "my-key:1" });
    expect((calls[0].init.headers as Record<string, string>)["Idempotency-Key"]).toBe("my-key:1");
  });

  it("posts invoke to /services/{id}/invoke with operationId and input", async () => {
    const { fetchImpl, calls } = mockFetch(() => ({ result: 1 }));
    const client = new SuperAgentClient({ apiKey: DUMMY_KEY, fetchImpl });
    await client.invoke("cloud-superbrain", {
      operationId: "memory.create",
      input: { text: "hi" },
    });
    expect(calls[0].url).toBe(`${DEFAULT_BASE_URL}/services/cloud-superbrain/invoke`);
    const body = JSON.parse(calls[0].init.body as string);
    expect(body.operationId).toBe("memory.create");
    expect(body.input).toEqual({ text: "hi" });
    expect(body.method).toBe("POST");
  });

  it("searchActions passes query params", async () => {
    const { fetchImpl, calls } = mockFetch(() => ({ actions: [] }));
    const client = new SuperAgentClient({ apiKey: DUMMY_KEY, fetchImpl });
    await client.searchActions({ query: "memory", mode: "write", limit: 5 });
    const url = new URL(calls[0].url);
    expect(url.pathname).toBe("/v1/actions");
    expect(url.searchParams.get("query")).toBe("memory");
    expect(url.searchParams.get("mode")).toBe("write");
    expect(url.searchParams.get("limit")).toBe("5");
  });

  it("creditBalance unwraps the credits envelope", async () => {
    const { fetchImpl } = mockFetch(() => ({ credits: { balanceCredits: 42 } }));
    const client = new SuperAgentClient({ apiKey: DUMMY_KEY, fetchImpl });
    expect(await client.creditBalance()).toEqual({ balanceCredits: 42 });
  });

  it("raises SuperAgentAPIError on error responses", async () => {
    const client = new SuperAgentClient({
      apiKey: DUMMY_KEY,
      fetchImpl: errorFetch(402, { message: "insufficient credits" }),
    });
    const err = await client.listServices().catch((e) => e);
    expect(err).toBeInstanceOf(SuperAgentAPIError);
    expect((err as SuperAgentAPIError).statusCode).toBe(402);
    expect((err as SuperAgentAPIError).message).toContain("insufficient credits");
  });

  it("fromEnv reads HIVEMINDOS_API_KEY", () => {
    vi.stubEnv("HIVEMINDOS_API_KEY", "hmos_env_key");
    const client = SuperAgentClient.fromEnv();
    expect(client).toBeInstanceOf(SuperAgentClient);
  });

  it("fromEnv throws when the env var is missing", () => {
    expect(() => SuperAgentClient.fromEnv()).toThrow(/HIVEMINDOS_API_KEY/);
  });
});

describe("tools", () => {
  function toolsWith(handler: (call: RecordedCall) => unknown) {
    const { fetchImpl, calls } = mockFetch(handler);
    const client = new SuperAgentClient({ apiKey: DUMMY_KEY, fetchImpl });
    return { tools: createSuperAgentTools(client), calls };
  }

  it("exposes all seven tools with descriptions and input schemas", () => {
    const { tools } = toolsWith(() => ({}));
    const names = Object.keys(tools).sort();
    expect(names).toEqual(
      [
        "superagent_get_credit_balance",
        "superagent_get_pricing",
        "superagent_invoke_service",
        "superagent_list_services",
        "superagent_memory_read",
        "superagent_memory_write",
        "superagent_search_actions",
      ].sort()
    );
    for (const t of Object.values(tools)) {
      expect((t as { description?: string }).description).toBeTruthy();
      expect((t as { inputSchema?: unknown }).inputSchema).toBeTruthy();
    }
  });

  it("memoryWrite invokes cloud-superbrain memory.create", async () => {
    const { tools, calls } = toolsWith(() => ({ id: "mem-1" }));
    const out = await (tools.superagent_memory_write as any).execute(
      { text: "fact one", memoryType: "fact", tags: "hivepunkz, launch" },
      TOOL_OPTIONS
    );
    expect(calls[0].url).toContain(`/services/${MEMORY_SERVICE_ID}/invoke`);
    const body = JSON.parse(calls[0].init.body as string);
    expect(body.operationId).toBe("memory.create");
    expect(body.input.text).toBe("fact one");
    expect(body.input.type).toBe("fact");
    expect(body.input.tags).toEqual(["hivepunkz", "launch"]);
    expect(out).toContain("mem-1");
  });

  it("memoryRead invokes cloud-superbrain memory.recall with clamped limit", async () => {
    const { tools, calls } = toolsWith(() => ({ memories: [] }));
    await (tools.superagent_memory_read as any).execute(
      { query: "launch date", limit: 999 },
      TOOL_OPTIONS
    );
    const body = JSON.parse(calls[0].init.body as string);
    expect(body.operationId).toBe("memory.recall");
    expect(body.input.limit).toBe(50);
  });

  it("invokeService forwards service, operation and input", async () => {
    const { tools, calls } = toolsWith(() => ({ done: true }));
    await (tools.superagent_invoke_service as any).execute(
      { serviceId: "svc-x", operationId: "thing.do", input: { a: 1 } },
      TOOL_OPTIONS
    );
    expect(calls[0].url).toContain("/services/svc-x/invoke");
    const body = JSON.parse(calls[0].init.body as string);
    expect(body.operationId).toBe("thing.do");
    expect(body.input).toEqual({ a: 1 });
  });

  it("never embeds the API key in tool definitions", () => {
    const { tools } = toolsWith(() => ({}));
    const serialized = JSON.stringify(tools, (_k, v) =>
      typeof v === "function" ? "[fn]" : v
    );
    expect(serialized).not.toContain(DUMMY_KEY);
  });
});
