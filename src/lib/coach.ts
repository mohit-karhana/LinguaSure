import { RealtimeAgent } from "@openai/agents/realtime";

export function createCoach(instructions: string) {
  return new RealtimeAgent({
    name: "LinguaSure",
    instructions,
  });
}
