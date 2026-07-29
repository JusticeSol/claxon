import { createClient } from "@supabase/supabase-js";
import type { SystemSnapshot } from "@/lib/agents";

const supabase = () =>
  createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

// ---- subscribers ----

export async function addSubscriber(chatId: number) {
  await supabase().from("subscribers").upsert({ chat_id: chatId });
}

export async function removeSubscriber(chatId: number) {
  await supabase().from("subscribers").delete().eq("chat_id", chatId);
}

export async function listSubscribers(): Promise<number[]> {
  const { data } = await supabase().from("subscribers").select("chat_id");
  return (data ?? []).map((r) => r.chat_id);
}

// ---- snapshot state (for edge-triggered rules) ----
// BigInt-safe JSON round-trip: serialize bigints as strings tagged with "n".

function replacer(_k: string, v: unknown) {
  return typeof v === "bigint" ? v.toString() + "n" : v;
}
function reviver(_k: string, v: unknown) {
  return typeof v === "string" && /^-?\d+n$/.test(v) ? BigInt(v.slice(0, -1)) : v;
}

export async function loadPrevSnapshot(): Promise<SystemSnapshot | null> {
  const { data } = await supabase()
    .from("watch_state")
    .select("payload")
    .eq("id", "latest")
    .maybeSingle();
  if (!data?.payload) return null;
  return JSON.parse(data.payload, reviver) as SystemSnapshot;
}

export async function saveSnapshot(s: SystemSnapshot) {
  await supabase()
    .from("watch_state")
    .upsert({ id: "latest", payload: JSON.stringify(s, replacer), updated_at: new Date().toISOString() });
}

// ---- alert dedupe (belt-and-braces on top of edge triggering) ----

export async function filterUnsent(keys: string[]): Promise<Set<string>> {
  if (keys.length === 0) return new Set();
  const cutoff = new Date(Date.now() - 6 * 3600_000).toISOString();
  const { data } = await supabase()
    .from("sent_alerts")
    .select("key")
    .in("key", keys)
    .gte("sent_at", cutoff);
  const already = new Set((data ?? []).map((r) => r.key));
  return new Set(keys.filter((k) => !already.has(k)));
}

export async function markSent(keys: string[]) {
  if (keys.length === 0) return;
  await supabase()
    .from("sent_alerts")
    .upsert(keys.map((key) => ({ key, sent_at: new Date().toISOString() })));
}
