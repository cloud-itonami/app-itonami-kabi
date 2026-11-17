import { describe, it, beforeEach } from "node:test";
import { expect } from "./expect.mjs";
import { LocalStore } from "../dist/local-store.js";
import { extendHypha, pruneHypha, fusionProbe, getNetwork, getNutrientFlow, maxFlow } from "../dist/domain/index.js";

describe("kabi mycelium network", () => {
  let e: any;
  beforeEach(() => { e = new LocalStore({ did: "did:web:kabi.itonami.cloud" }); });

  it("extends hyphae, refuses self loops, bad capacity and duplicates", async () => {
    expect((await extendHypha(e, { hyphaId: "h1", from: "a", to: "b", capacity: 5 })).status).toBe("extended");
    expect((await extendHypha(e, { hyphaId: "h1", from: "a", to: "b", capacity: 5 })).status).toBe("alreadyExists");
    expect((await extendHypha(e, { hyphaId: "h2", from: "a", to: "a", capacity: 5 })).error).toBe("selfLoop");
    expect((await extendHypha(e, { hyphaId: "h3", from: "a", to: "c", capacity: 0 })).error).toBe("capacityMustBePositiveInteger");
    expect((await extendHypha(e, { hyphaId: "h4", from: "a", to: "c", capacity: 1.5 })).error).toBe("capacityMustBePositiveInteger");
  });

  it("prunes once and drops pruned hyphae from the active network", async () => {
    await extendHypha(e, { hyphaId: "h1", from: "a", to: "b", capacity: 5 });
    await extendHypha(e, { hyphaId: "h2", from: "b", to: "c", capacity: 5 });
    expect((await pruneHypha(e, { hyphaId: "h2", reason: "starved" })).status).toBe("pruned");
    expect((await pruneHypha(e, { hyphaId: "h2" })).status).toBe("alreadyPruned");
    expect((await pruneHypha(e, { hyphaId: "nope" })).error).toBe("hyphaNotFound");
    const net = await getNetwork(e);
    expect(net.activeHyphaCount).toBe(1);
    expect(net.nodeCount).toBe(2);
    expect((await getNetwork(e, { includePruned: true })).nodeCount).toBe(3);
  });

  it("fuses only tips of the same vegetative compatibility group", async () => {
    expect((await fusionProbe(e, { probeId: "p1", tipA: "a", tipB: "b", vcgA: "VCG-1", vcgB: "VCG-1" })).compatible).toBe(true);
    const no = await fusionProbe(e, { probeId: "p2", tipA: "a", tipB: "c", vcgA: "VCG-1", vcgB: "VCG-2" });
    expect(no.compatible).toBe(false);
    expect(no.outcome).toBe("heterokaryonIncompatible");
    expect((await fusionProbe(e, { probeId: "p3", tipA: "a", tipB: "a", vcgA: "x", vcgB: "x" })).error).toBe("sameTip");
  });

  it("computes maximum nutrient flow over active hyphae", async () => {
    // Classic example: max flow s→t is 23.
    const edges = [["s", "a", 16], ["s", "c", 13], ["a", "b", 12], ["c", "a", 4], ["b", "c", 9], ["c", "d", 14], ["d", "b", 7], ["b", "t", 20], ["d", "t", 4]];
    for (const [i, [from, to, capacity]] of edges.entries()) await extendHypha(e, { hyphaId: `h${i}`, from, to, capacity });
    expect((await getNutrientFlow(e, { source: "s", sink: "t" })).maxFlow).toBe(23);
    await pruneHypha(e, { hyphaId: "h7" }); // b→t gone: only d→t (4) remains
    expect((await getNutrientFlow(e, { source: "s", sink: "t" })).maxFlow).toBe(4);
    expect((await getNutrientFlow(e, { source: "s", sink: "zz" })).maxFlow).toBe(0);
    expect((await getNutrientFlow(e, { source: "s", sink: "s" })).error).toBe("sourceEqualsSink");
  });

  it("maxFlow handles parallel channels", () => {
    expect(maxFlow([{ from: "a", to: "b", capacity: 2 }, { from: "a", to: "b", capacity: 3 }], "a", "b").flow).toBe(5);
  });
});
