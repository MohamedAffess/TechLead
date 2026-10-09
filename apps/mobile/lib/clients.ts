import "react-native-url-polyfill/auto";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { createClient } from "@supabase/supabase-js";
import { createApiClient } from "@techlead/api-client";
import { MICROSOFT_SCOPES } from "@techlead/shared";
import Constants from "expo-constants";
import * as Linking from "expo-linking";
import * as WebBrowser from "expo-web-browser";

type Extra = { apiUrl?: string; supabaseUrl?: string; supabaseAnonKey?: string };
const extra = (Constants.expoConfig?.extra ?? {}) as Extra;

export const apiUrl = extra.apiUrl ?? "http://localhost:8787";
export const configured = Boolean(extra.supabaseUrl && extra.supabaseAnonKey);

export const supabase = createClient(extra.supabaseUrl || "https://not-configured.invalid", extra.supabaseAnonKey || "missing", {
  auth: { storage: AsyncStorage, persistSession: true, autoRefreshToken: true, detectSessionInUrl: false, flowType: "pkce" },
});

export const api = createApiClient(apiUrl, async () => (await supabase.auth.getSession()).data.session?.access_token ?? null);

/**
 * Microsoft sign-in in the system browser sheet. In Expo Go the return link is
 * exp://…/--/auth-callback; in an installed build it is techlead://auth-callback.
 * Both must be in Supabase's redirect URL list.
 */
export async function signInWithMicrosoft(): Promise<void> {
  const redirectTo = Linking.createURL("auth-callback");
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "azure",
    options: { redirectTo, scopes: MICROSOFT_SCOPES.join(" "), skipBrowserRedirect: true },
  });
  if (error || !data.url) throw error ?? new Error("Could not start sign-in.");
  const result = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);
  if (result.type !== "success") return;
  const { queryParams } = Linking.parse(result.url);
  const code = typeof queryParams?.code === "string" ? queryParams.code : null;
  if (!code) throw new Error(typeof queryParams?.error_description === "string" ? queryParams.error_description : "Sign-in did not finish.");
  const { data: exchanged, error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);
  if (exchangeError) throw exchangeError;
  // Same hand-off as the web app: lets the worker read Teams transcripts. Non-owners are refused, which is fine.
  const s = exchanged.session;
  if (s?.provider_token) {
    await api.saveMicrosoftToken({ accessToken: s.provider_token, refreshToken: s.provider_refresh_token ?? null }).catch(() => {});
  }
}
