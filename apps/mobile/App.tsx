import { createApiClient } from "@techlead/api-client";
import Constants from "expo-constants";
import { StatusBar } from "expo-status-bar";
import { useEffect, useState } from "react";
import { SafeAreaView, StyleSheet, Text, useColorScheme, View } from "react-native";

const apiUrl = (Constants.expoConfig?.extra?.apiUrl as string | undefined) ?? "http://localhost:8787";

// Sign-in with Microsoft lands in the next step; until then the app checks it can reach the API.
const api = createApiClient(apiUrl, async () => null);

export default function App() {
  const dark = useColorScheme() === "dark";
  const [status, setStatus] = useState<"checking" | "online" | "offline">("checking");

  useEffect(() => {
    fetch(`${apiUrl}/health`)
      .then((r) => setStatus(r.ok ? "online" : "offline"))
      .catch(() => setStatus("offline"));
  }, []);

  const colors = dark ? { bg: "#0e141a", fg: "#e5ebf1", muted: "#92a0ae" } : { bg: "#eef1f4", fg: "#16202a", muted: "#5b6876" };

  return (
    <SafeAreaView style={[styles.screen, { backgroundColor: colors.bg }]}>
      <View style={styles.body}>
        <Text style={[styles.title, { color: colors.fg }]}>TechLead</Text>
        <Text style={{ color: colors.muted }}>Your solutions, tasks, decisions and team, on the go.</Text>
        <Text style={[styles.status, { color: colors.muted }]}>
          API: {status === "checking" ? "checking" : status === "online" ? "connected" : `not reachable at ${apiUrl}`}
        </Text>
      </View>
      <StatusBar style="auto" />
    </SafeAreaView>
  );
}

export { api };

const styles = StyleSheet.create({
  screen: { flex: 1 },
  body: { flex: 1, padding: 24, gap: 8, justifyContent: "center" },
  title: { fontSize: 32, fontWeight: "700" },
  status: { marginTop: 16, fontSize: 13 },
});
