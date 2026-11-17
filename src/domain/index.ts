/**
 * kabi (カビ, mold) — mycelium network layer, local domain (AWAI-3079).
 *
 * Designed from the former Worker's method list (extendHypha / pruneHypha /
 * fusionProbe / getNetwork / getNutrientFlow); the original logic ran on a
 * remote LangServer and was not in this repository.
 *
 *   hypha   : a directed channel between two agents (e.g. kobo agents) with an
 *             integer nutrient capacity. Pruning keeps the record, inactive.
 *   fusion  : anastomosis — two hyphae tips fuse only when both carry the same
 *             vegetative compatibility group (VCG). Each probe is recorded.
 *   network : nodes and active hyphae, with in/out degree.
 *   flow    : maximum nutrient flow from a source to a sink over the active
 *             hyphae (Edmonds–Karp on capacities).
 */
import type { LocalStore } from "../local-store.js";
import { getOne, idSlug, isNonEmpty, listAll, nowISO, put } from "./records.js";

export const HYPHA = "cloud.itonami.apps.kabi.hypha";
export const FUSION = "cloud.itonami.apps.kabi.fusionProbe";

export interface Hypha {
  hyphaId: string;
  from: string;
  to: string;
  capacity: number;
  status: "active" | "pruned";
  createdAt: string;
  prunedAt?: string;
}

export interface ExtendHyphaInput { hyphaId: string; from: string; to: string; capacity: number }
export interface PruneHyphaInput { hyphaId: string; reason?: string }
export interface FusionProbeInput { probeId: string; tipA: string; tipB: string; vcgA: string; vcgB: string }
export interface GetNetworkInput { includePruned?: boolean }
export interface GetNutrientFlowInput { source: string; sink: string }

const hyphaKey = (id: string) => `hypha-${idSlug(id)}`;

export async function extendHypha(e: LocalStore, input: ExtendHyphaInput) {
  if (!isNonEmpty(input.hyphaId) || !isNonEmpty(input.from) || !isNonEmpty(input.to)) return { status: "rejected", error: "missingRequiredFields" };
  if (input.from === input.to) return { status: "rejected", error: "selfLoop" };
  if (!Number.isInteger(input.capacity) || input.capacity <= 0) return { status: "rejected", error: "capacityMustBePositiveInteger" };
  const existing = await getOne<Hypha>(e, HYPHA, hyphaKey(input.hyphaId));
  if (existing) return { status: "alreadyExists", hyphaUri: existing.uri };
  const hypha: Hypha = { hyphaId: input.hyphaId, from: input.from, to: input.to, capacity: input.capacity, status: "active", createdAt: nowISO() };
  return { status: "extended", hyphaUri: await put(e, HYPHA, hyphaKey(input.hyphaId), hypha) };
}

export async function pruneHypha(e: LocalStore, input: PruneHyphaInput) {
  if (!isNonEmpty(input.hyphaId)) return { status: "rejected", error: "missingRequiredFields" };
  const existing = await getOne<Hypha>(e, HYPHA, hyphaKey(input.hyphaId));
  if (!existing) return { status: "rejected", error: "hyphaNotFound" };
  if (existing.value.status === "pruned") return { status: "alreadyPruned" };
  const pruned: Hypha & { pruneReason?: string } = { ...existing.value, status: "pruned", prunedAt: nowISO(), pruneReason: input.reason };
  await put(e, HYPHA, hyphaKey(input.hyphaId), pruned);
  return { status: "pruned", hyphaId: input.hyphaId };
}

export async function fusionProbe(e: LocalStore, input: FusionProbeInput) {
  if (![input.probeId, input.tipA, input.tipB, input.vcgA, input.vcgB].every(isNonEmpty)) return { status: "rejected", error: "missingRequiredFields" };
  if (input.tipA === input.tipB) return { status: "rejected", error: "sameTip" };
  const compatible = input.vcgA.trim() === input.vcgB.trim();
  const record = { ...input, compatible, outcome: compatible ? "fused" : "heterokaryonIncompatible", probedAt: nowISO() };
  await put(e, FUSION, `probe-${idSlug(input.probeId)}`, record);
  return { status: "probed", compatible, outcome: record.outcome };
}

async function hyphae(e: LocalStore, includePruned = false): Promise<Hypha[]> {
  return (await listAll<Hypha>(e, HYPHA)).map((r) => r.value).filter((h) => includePruned || h.status === "active");
}

export async function getNetwork(e: LocalStore, input: GetNetworkInput = {}) {
  const edges = await hyphae(e, !!input.includePruned);
  const degree = new Map<string, { in: number; out: number }>();
  for (const h of edges) {
    for (const n of [h.from, h.to]) if (!degree.has(n)) degree.set(n, { in: 0, out: 0 });
    if (h.status === "active") { degree.get(h.from)!.out++; degree.get(h.to)!.in++; }
  }
  const nodes = [...degree.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([id, d]) => ({ id, ...d }));
  return { nodes, hyphae: edges, nodeCount: nodes.length, activeHyphaCount: edges.filter((h) => h.status === "active").length };
}

/** Maximum flow (Edmonds–Karp) from source to sink over active hyphae capacities. */
export function maxFlow(edges: Array<Pick<Hypha, "from" | "to" | "capacity">>, source: string, sink: string) {
  const cap = new Map<string, Map<string, number>>();
  const add = (a: string, b: string, c: number) => {
    if (!cap.has(a)) cap.set(a, new Map());
    if (!cap.has(b)) cap.set(b, new Map());
    cap.get(a)!.set(b, (cap.get(a)!.get(b) ?? 0) + c);
    if (!cap.get(b)!.has(a)) cap.get(b)!.set(a, 0);
  };
  for (const h of edges) add(h.from, h.to, h.capacity);
  if (!cap.has(source) || !cap.has(sink)) return { flow: 0, paths: [] as string[][] };
  let flow = 0;
  const paths: string[][] = [];
  for (;;) {
    const parent = new Map<string, string>([[source, source]]);
    const queue = [source];
    while (queue.length && !parent.has(sink)) {
      const u = queue.shift()!;
      for (const [v, c] of cap.get(u)!) if (c > 0 && !parent.has(v)) { parent.set(v, u); queue.push(v); }
    }
    if (!parent.has(sink)) break;
    let bottleneck = Infinity;
    const path = [sink];
    for (let v = sink; v !== source; v = parent.get(v)!) { bottleneck = Math.min(bottleneck, cap.get(parent.get(v)!)!.get(v)!); path.unshift(parent.get(v)!); }
    for (let v = sink; v !== source; v = parent.get(v)!) {
      const u = parent.get(v)!;
      cap.get(u)!.set(v, cap.get(u)!.get(v)! - bottleneck);
      cap.get(v)!.set(u, cap.get(v)!.get(u)! + bottleneck);
    }
    flow += bottleneck;
    paths.push(path);
  }
  return { flow, paths };
}

export async function getNutrientFlow(e: LocalStore, input: GetNutrientFlowInput) {
  if (!isNonEmpty(input.source) || !isNonEmpty(input.sink)) return { status: "rejected", error: "missingRequiredFields" };
  if (input.source === input.sink) return { status: "rejected", error: "sourceEqualsSink" };
  const { flow, paths } = maxFlow(await hyphae(e), input.source, input.sink);
  return { status: "ok", source: input.source, sink: input.sink, maxFlow: flow, augmentingPaths: paths };
}
