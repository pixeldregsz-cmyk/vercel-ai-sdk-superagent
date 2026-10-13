/**
 * Vercel AI SDK tools for the HivemindOS SuperAgent API.
 *
 * Seven tools covering the API's discovery surface, service invocation,
 * credit balance, pricing, and managed memory (cloud-superbrain).
 */

import { tool, type Tool } from "ai";
import { z } from "zod";
import { SuperAgentClient } from "./client.js";

/** Managed service that hosts memory (no standalone memory REST endpoints). */
export const MEMORY_SERVICE_ID = "cloud-superbrain";

const MAX_OUTPUT_CHARS = 8000;

function truncate(value: unknown): string {
  const text = typeof value === "string" ? value : JSON.stringify(value, null, 2);
  return text.length > MAX_OUTPUT_CHARS ? text.slice(0, MAX_OUTPUT_CHARS) : text;
}

function parseTags(tags?: string): string[] | undefined {
  const list = (tags ?? "").split(",").map((t) => t.trim()).filter(Boolean);
  return list.length > 0 ? list : undefined;
}

/** Build the seven SuperAgent tools bound to a client. */
export function createSuperAgentTools(client: SuperAgentClient): Record<string, Tool> {
  const listServices = tool({
    description:
      "List the managed services available to this SuperAgent API key " +
      "(models, memory, wallets, trading, media, automations, nft-agents, ...). " +
      "Start here to discover what the agent can do. Optional name filter narrows results.",
    inputSchema: z.object({
      nameFilter: z
        .string()
        .optional()
        .describe("Case-insensitive substring filter on the service id or title."),
    }),
    execute: async ({ nameFilter }) => {
      const services = await client.listServices();
      const filtered = nameFilter
        ? services.filter((s) =>
            JSON.stringify(s).toLowerCase().includes(nameFilter.toLowerCase())
          )
        : services;
      return truncate(
        filtered.map((s) => ({
          id: (s as Record<string, unknown>).id,
          title: (s as Record<string, unknown>).title ?? (s as Record<string, unknown>).name,
          description: (s as Record<string, unknown>).description,
        }))
      );
    },
  });

  const searchActions = tool({
    description:
      "Search the 400+ invokable actions across SuperAgent managed services. " +
      "Use before invoking: find the exact operationId and its input shape.",
    inputSchema: z.object({
      query: z.string().optional().describe("Free-text search, e.g. 'send eth' or 'recall memory'."),
      actionId: z.string().optional().describe("Exact action id lookup, e.g. 'memory.create'."),
      serviceId: z.string().optional().describe("Restrict to one service, e.g. 'cloud-superbrain'."),
      mode: z
        .enum(["read", "write", "execute"])
        .optional()
        .describe("Filter by capability mode."),
      limit: z.number().int().min(1).max(100).default(20).describe("Max results (1-100)."),
    }),
    execute: async (input) => truncate(await client.searchActions(input)),
  });

  const invokeService = tool({
    description:
      "Invoke a managed service operation on the SuperAgent API — the workhorse tool. " +
      "Runs any of the 400+ operations across the managed services. " +
      "Mutations automatically get a unique Idempotency-Key header unless you supply your own. " +
      "Charged calls spend API credits; check getCreditBalance first.",
    inputSchema: z.object({
      serviceId: z.string().describe("Service id from listServices, e.g. 'cloud-superbrain'."),
      operationId: z
        .string()
        .describe("Operation id from searchActions, e.g. 'memory.create' or 'services.invoke.x.y'."),
      input: z
        .record(z.unknown())
        .optional()
        .describe("Operation input payload as an object."),
      idempotencyKey: z
        .string()
        .optional()
        .describe("Override the auto-generated Idempotency-Key (must match ^[A-Za-z0-9:._-]+$)."),
    }),
    execute: async ({ serviceId, operationId, input, idempotencyKey }) =>
      truncate(
        await client.invoke(serviceId, {
          operationId,
          input: input ?? {},
          idempotencyKey,
        })
      ),
  });

  const getCreditBalance = tool({
    description:
      "Read the SuperAgent account's credit balance (balanceCredits plus lifetime " +
      "credited/debited totals). Invoke and other spending operations are refused when " +
      "the balance cannot cover them, so check this before running paid work.",
    inputSchema: z.object({}),
    execute: async () => truncate(await client.creditBalance()),
  });

  const getPricing = tool({
    description: "Read server-owned service pricing for the SuperAgent API.",
    inputSchema: z.object({}),
    execute: async () => truncate(await client.pricing()),
  });

  const memoryWrite = tool({
    description:
      "Save one memory (fact, decision, preference, note) to managed memory. " +
      "Runs cloud-superbrain memory.create. Free for the first 200 memories, then 1 credit each.",
    inputSchema: z.object({
      text: z.string().describe("The memory content to save."),
      memoryType: z
        .string()
        .default("note")
        .describe("Memory type, e.g. 'note', 'fact', 'preference', 'decision'."),
      tags: z
        .string()
        .optional()
        .describe("Comma-separated tags, e.g. 'hivepunkz, launch'."),
      project: z.string().optional().describe("Project namespace for the memory."),
    }),
    execute: async ({ text, memoryType, tags, project }) => {
      const input: Record<string, unknown> = { text, type: memoryType };
      const tagList = parseTags(tags);
      if (tagList) input.tags = tagList;
      if (project) input.project = project;
      return truncate(
        await client.invoke(MEMORY_SERVICE_ID, { operationId: "memory.create", input })
      );
    },
  });

  const memoryRead = tool({
    description:
      "Search saved memories by meaning and keywords. Runs cloud-superbrain memory.recall. " +
      "Returns matching memories, not an answer. Costs 1 credit per recall when semantic mode applies.",
    inputSchema: z.object({
      query: z.string().describe("What to look for in memory."),
      tags: z.string().optional().describe("Comma-separated tag filter."),
      project: z.string().optional().describe("Project namespace filter."),
      limit: z.number().int().min(1).max(50).default(10).describe("Max memories to return (1-50)."),
    }),
    execute: async ({ query, tags, project, limit }) => {
      const clampedLimit = Math.max(1, Math.min(limit ?? 10, 50));
      const input: Record<string, unknown> = { query, limit: clampedLimit };
      const tagList = parseTags(tags);
      if (tagList) input.tags = tagList;
      if (project) input.project = project;
      return truncate(
        await client.invoke(MEMORY_SERVICE_ID, { operationId: "memory.recall", input })
      );
    },
  });

  return {
    superagent_list_services: listServices,
    superagent_search_actions: searchActions,
    superagent_invoke_service: invokeService,
    superagent_get_credit_balance: getCreditBalance,
    superagent_get_pricing: getPricing,
    superagent_memory_write: memoryWrite,
    superagent_memory_read: memoryRead,
  };
}

/**
 * Build the tools from the HIVEMINDOS_API_KEY environment variable.
 * Optional overrides: baseUrl, appId, projectId.
 */
export function superAgentTools(
  overrides: { baseUrl?: string; appId?: string; projectId?: string } = {}
): Record<string, Tool> {
  return createSuperAgentTools(SuperAgentClient.fromEnv(overrides));
}
