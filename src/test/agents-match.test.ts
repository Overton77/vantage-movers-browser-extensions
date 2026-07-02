import { describe, expect, it } from "vitest";

import type { Agent } from "../api/agents";
import { matchAgentsByFirstName } from "../workflows/agents/match";

function makeAgent(overrides: Partial<Agent> = {}): Agent {
  return {
    id: "agent-1",
    _id: "agent-1",
    name: "Nick Smith",
    normalized_name: "nick smith",
    active: true,
    created_from: "admin",
    ...overrides,
  };
}

describe("matchAgentsByFirstName", () => {
  it("returns a single match, case-insensitively, against the agent's first name", () => {
    const agents = [makeAgent({ name: "Nick Smith" }), makeAgent({ id: "a2", _id: "a2", name: "Jane Doe" })];

    const result = matchAgentsByFirstName("NICK", agents);

    expect(result.status).toBe("single");
    expect(result.candidates).toHaveLength(1);
    expect(result.candidates[0].name).toBe("Nick Smith");
  });

  it("returns multiple matches when more than one agent shares the first name", () => {
    const agents = [
      makeAgent({ id: "a1", _id: "a1", name: "Nick Smith" }),
      makeAgent({ id: "a2", _id: "a2", name: "Nick Jones" }),
      makeAgent({ id: "a3", _id: "a3", name: "Jane Doe" }),
    ];

    const result = matchAgentsByFirstName("nick", agents);

    expect(result.status).toBe("multiple");
    expect(result.candidates.map((agent) => agent.id)).toEqual(["a1", "a2"]);
  });

  it("returns none when no agent's first name matches", () => {
    const agents = [makeAgent({ name: "Nick Smith" })];

    const result = matchAgentsByFirstName("AUSTIN", agents);

    expect(result.status).toBe("none");
    expect(result.candidates).toEqual([]);
  });

  it("returns none for a blank raw value without matching every agent", () => {
    const agents = [makeAgent({ name: "" }), makeAgent({ name: "  " })];

    const result = matchAgentsByFirstName("   ", agents);

    expect(result.status).toBe("none");
    expect(result.candidates).toEqual([]);
  });

  it("still matches inactive agents (owner can link to any agent, active or not)", () => {
    const agents = [makeAgent({ name: "Nick Smith", active: false })];

    const result = matchAgentsByFirstName("Nick", agents);

    expect(result.status).toBe("single");
    expect(result.candidates[0].active).toBe(false);
  });
});
