// Vercel entry point (free Hobby plan). Every path is routed here by vercel.json.
import { dbConfigFromEnv } from "@techlead/db";
import { handle } from "hono/vercel";
import { createApp } from "../src/app.js";
import { supabaseMembers } from "../src/members.js";

const app = createApp({
  resolveMember: supabaseMembers(dbConfigFromEnv()),
  allowedOrigins: process.env.ALLOWED_ORIGINS?.split(","),
});

export const GET = handle(app);
export const POST = handle(app);
export const PUT = handle(app);
export const PATCH = handle(app);
export const DELETE = handle(app);
export const OPTIONS = handle(app);
