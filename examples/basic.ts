/**
 * Read-only walkthrough of the SuperAgent tools with the Vercel AI SDK.
 *
 * Run: HIVEMINDOS_API_KEY=<redacted> npm run example
 * (Paid examples are commented out — the demo account holds 0 credits.)
 */
import { generateText } from "ai";
import { superAgentTools } from "../src/index.js";

const tools = superAgentTools();

async function main() {
  // 1. List services (read-only, free)
  const services = await (tools.superagent_list_services as any).execute(
    { nameFilter: "memory" },
    { toolCallId: "demo-1", messages: [] }
  );
  console.log("== memory services ==");
  console.log(services);

  // 2. Find the memory.create action
  const actions = await (tools.superagent_search_actions as any).execute(
    { query: "memory", limit: 5 },
    { toolCallId: "demo-2", messages: [] }
  );
  console.log("\n== memory actions ==");
  console.log(actions);

  // 3. Check the credit balance
  const balance = await (tools.superagent_get_credit_balance as any).execute(
    {},
    { toolCallId: "demo-3", messages: [] }
  );
  console.log("\n== credit balance ==");
  console.log(balance);

  // 4. Full agent loop: let a model use the tools (needs a model provider key)
  // const { text } = await generateText({
  //   model: openai("gpt-4o-mini"),
  //   tools,
  //   maxSteps: 5,
  //   prompt: "What SuperAgent services are available, and what is my credit balance?",
  // });
  // console.log("\n== agent answer ==");
  // console.log(text);

  // 5. Paid example (needs credits):
  // const saved = await (tools.superagent_memory_write as any).execute(
  //   { text: "HivePunk #21 mines NVDA weekly.", memoryType: "fact", tags: "hivepunkz" },
  //   { toolCallId: "demo-5", messages: [] }
  // );
  // console.log("\n== memory write ==");
  // console.log(saved);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
