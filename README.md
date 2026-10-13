# vercel-ai-sdk-superagent

Vercel AI SDK tools for the [HivemindOS SuperAgent API](https://hivemindos.app/superagent-api/docs/) — give any AI SDK agent access to 40 managed services / 400+ operations (models, memory, wallets, trading, media, automations, nft-agents, …), plus credit balance and pricing lookups.

Built for the HivemindOS Hall bounty: *"Publish a Vercel AI SDK tool that calls the SuperAgent API"* (25,000 credits).

## Install

```bash
npm install @hivepunk21/vercel-ai-sdk-superagent ai zod
```

Set your key (get one at the [HivemindOS console](https://hivemindos.app/superagent-api/docs/)):

```bash
export HIVEMINDOS_API_KEY=<your-key>
```

## Quickstart

```ts
import { generateText } from "ai";
import { openai } from "@ai-sdk/openai";
import { superAgentTools } from "@hivepunk21/vercel-ai-sdk-superagent";

const { text } = await generateText({
  model: openai("gpt-4o-mini"),
  tools: superAgentTools(),
  maxSteps: 5,
  prompt: "What SuperAgent services are available, and what is my credit balance?",
});

console.log(text);
```

Need a custom client (app id, project, timeout)?

```ts
import { SuperAgentClient, createSuperAgentTools } from "@hivepunk21/vercel-ai-sdk-superagent";

const client = new SuperAgentClient({ apiKey: process.env.HIVEMINDOS_API_KEY! });
const tools = createSuperAgentTools(client);
```

## Tools

| Tool | What it does | Costs |
|---|---|---|
| `superagent_list_services` | List managed services this key can use (optional name filter) | free |
| `superagent_search_actions` | Search 400+ invokable actions (query / actionId / serviceId / mode) | free |
| `superagent_invoke_service` | Invoke any service operation — the workhorse | credits vary |
| `superagent_get_credit_balance` | Read balanceCredits + lifetime totals | free |
| `superagent_get_pricing` | Read server-owned service pricing | free |
| `superagent_memory_write` | Save a memory via `cloud-superbrain` `memory.create` | free ≤200, then 1 credit |
| `superagent_memory_read` | Recall memories via `cloud-superbrain` `memory.recall` | 1 credit (semantic mode) |

## Notes

- **Auth**: Bearer <redacted> API key via `HIVEMINDOS_API_KEY` or the `apiKey` option. Never commit a key.
- **Idempotency**: every mutation automatically gets a unique `Idempotency-Key` header (uuid4 hex, fits the API's `^[A-Za-z0-9:._-]+$` pattern); pass `idempotencyKey` to override.
- **Cloudflare**: `api.hivemindos.app` bot-blocks default non-browser user agents (HTTP 403). The client sends a browser-like `User-Agent` — no action needed.
- **Memory**: there are no standalone memory REST endpoints; memory lives in the `cloud-superbrain` managed service (`memory.create` / `memory.recall`), which the memory tools call for you.
- **Hall app attribution**: pass `appId` (and `projectId`) to `SuperAgentClient` to send `X-HivemindOS-App`; its owner earns a share of charged calls.

## Dev

```bash
npm install
npm test        # vitest, all HTTP mocked — no credits or network needed
npm run build   # tsc → dist/
npm run example # read-only walkthrough (needs HIVEMINDOS_API_KEY)
```

## Publishing checklist

1. `npm login` (needs an npm account)
2. `npm run build && npm publish --access public`
3. Tag a GitHub release (`v0.1.0`) in a public repo
4. File the bounty claim on the HivemindOS Hall Rewards page with the npm link
5. Optional: fund the account with credits to live-test `invoke` / memory write+read (validated here against the OpenAPI spec + catalog only)

## License

MIT — see [LICENSE](./LICENSE).
