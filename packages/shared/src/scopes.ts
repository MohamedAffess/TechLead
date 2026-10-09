/**
 * Delegated Microsoft Graph scopes requested at sign-in. All read-only.
 * The web and iOS apps ask for them; the worker uses them to refresh the token.
 */
export const MICROSOFT_SCOPES = ["openid", "email", "profile", "offline_access", "Calendars.Read", "OnlineMeetings.Read", "OnlineMeetingTranscript.Read.All"];
