import type { Me } from "@techlead/api-client";
import type { Proposal, Solution } from "@techlead/shared";
import { StatusBar } from "expo-status-bar";
import { useCallback, useEffect, useState } from "react";
import { Pressable, RefreshControl, SafeAreaView, ScrollView, StyleSheet, Text, useColorScheme, View } from "react-native";
import { api, apiUrl, configured, signInWithMicrosoft, supabase } from "./lib/clients";

type State =
  | { kind: "loading" }
  | { kind: "signed-out"; error?: string }
  | { kind: "ready"; me: Me; solutions: Solution[]; proposals: Proposal[] }
  | { kind: "error"; message: string };

const light = { bg: "#eef1f4", surface: "#ffffff", fg: "#16202a", muted: "#5b6876", line: "#d6dde4", accent: "#1d5c8f", accentInk: "#ffffff" };
const dark = { bg: "#0e141a", surface: "#161f28", fg: "#e5ebf1", muted: "#92a0ae", line: "#283441", accent: "#6aa6dc", accentInk: "#0b1620" };

export default function App() {
  const c = useColorScheme() === "dark" ? dark : light;
  const [state, setState] = useState<State>({ kind: "loading" });
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    if (!configured) return setState({ kind: "error", message: "Set supabaseUrl and supabaseAnonKey in apps/mobile/app.json (see docs/DEPLOYMENT.md, step 7)." });
    const { data } = await supabase.auth.getSession();
    if (!data.session) return setState({ kind: "signed-out" });
    try {
      const me = await api.me();
      const [solutions, proposals] = await Promise.all([api.solutions(), me.role === "owner" ? api.proposals() : Promise.resolve([])]);
      setState({ kind: "ready", me, solutions, proposals });
    } catch (err) {
      setState({ kind: "error", message: err instanceof Error ? `${err.message} (API: ${apiUrl})` : "Could not load your desk." });
    }
  }, []);

  useEffect(() => {
    void load();
    const sub = supabase.auth.onAuthStateChange(() => void load());
    return () => sub.data.subscription.unsubscribe();
  }, [load]);

  const refresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  const Button = ({ label, onPress, primary }: { label: string; onPress: () => void; primary?: boolean }) => (
    <Pressable
      onPress={onPress}
      style={[styles.button, { borderColor: primary ? c.accent : c.line, backgroundColor: primary ? c.accent : c.surface }]}
      accessibilityRole="button"
    >
      <Text style={{ color: primary ? c.accentInk : c.fg, fontWeight: "600" }}>{label}</Text>
    </Pressable>
  );

  const panel = [styles.panel, { backgroundColor: c.surface, borderColor: c.line }];

  return (
    <SafeAreaView style={[styles.screen, { backgroundColor: c.bg }]}>
      <ScrollView contentContainerStyle={styles.body} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void refresh()} />}>
        <Text style={[styles.title, { color: c.fg }]}>TechLead</Text>

        {state.kind === "loading" && <Text style={{ color: c.muted }}>Opening your desk…</Text>}
        {state.kind === "error" && <Text style={{ color: c.fg }}>{state.message}</Text>}

        {state.kind === "signed-out" && (
          <View style={panel}>
            <Text style={[styles.h2, { color: c.fg }]}>Sign in</Text>
            <Text style={{ color: c.muted }}>Use your Microsoft work account.</Text>
            {state.error && <Text style={{ color: c.fg }}>{state.error}</Text>}
            <Button
              primary
              label="Sign in with Microsoft"
              onPress={() => signInWithMicrosoft().catch((err) => setState({ kind: "signed-out", error: err instanceof Error ? err.message : "Sign-in failed." }))}
            />
          </View>
        )}

        {state.kind === "ready" && (
          <>
            <View style={[styles.row, { justifyContent: "space-between" }]}>
              <Text style={{ color: c.fg }}>
                Hello, {state.me.displayName} <Text style={{ color: c.muted }}>({state.me.role})</Text>
              </Text>
              <Button label="Sign out" onPress={() => void supabase.auth.signOut()} />
            </View>

            {state.me.role === "owner" && (
              <View style={panel}>
                <Text style={[styles.h2, { color: c.fg }]}>Review inbox</Text>
                {state.proposals.length === 0 ? (
                  <Text style={{ color: c.muted }}>Nothing to review.</Text>
                ) : (
                  state.proposals.map((p) => (
                    <View key={p.id} style={[styles.item, { borderColor: c.line }]}>
                      <Text style={{ color: c.fg }}>
                        <Text style={{ fontWeight: "700" }}>{p.draft.kind.replace("_", " ")}</Text>: {"title" in p.draft ? p.draft.title : p.draft.personName}
                      </Text>
                      <Text style={{ color: c.muted }}>“{p.evidence}”</Text>
                      <View style={styles.row}>
                        <Button primary label="Private" onPress={() => void api.acceptProposal(p.id, "private").then(load)} />
                        <Button label="For team" onPress={() => void api.acceptProposal(p.id, "team").then(load)} />
                        <Button label="Reject" onPress={() => void api.rejectProposal(p.id).then(load)} />
                      </View>
                    </View>
                  ))
                )}
              </View>
            )}

            <View style={panel}>
              <Text style={[styles.h2, { color: c.fg }]}>Solutions</Text>
              {state.solutions.length === 0 ? (
                <Text style={{ color: c.muted }}>No solutions yet.</Text>
              ) : (
                state.solutions.map((s) => (
                  <Text key={s.id} style={{ color: c.fg }}>
                    {s.name} <Text style={{ color: c.muted }}>· {s.phase} · {s.health}</Text>
                  </Text>
                ))
              )}
            </View>
          </>
        )}
      </ScrollView>
      <StatusBar style="auto" />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  body: { padding: 20, gap: 16 },
  title: { fontSize: 30, fontWeight: "700" },
  h2: { fontSize: 18, fontWeight: "700" },
  panel: { borderWidth: 1, borderRadius: 8, padding: 14, gap: 10 },
  item: { borderTopWidth: StyleSheet.hairlineWidth, paddingTop: 10, gap: 6 },
  row: { flexDirection: "row", alignItems: "center", gap: 8, flexWrap: "wrap" },
  button: { borderWidth: 1, borderRadius: 6, paddingVertical: 8, paddingHorizontal: 12 },
});
