import "server-only";

import * as core from "@sahan-sac/ai-core/availability";

import { getEnv, type AppEnv } from "@/lib/env";

// The app's AI feature switches, bound to its parsed env so pages and routes
// can call them with no arguments. The rules live in @sahan-sac/ai-core.

export const textAiConfigured = (env: AppEnv = getEnv()): boolean => core.textAiConfigured(env);
export const blogAiEnabled = (env: AppEnv = getEnv()): boolean => core.blogAiEnabled(env);
export const blogAiImagesEnabled = (env: AppEnv = getEnv()): boolean => core.blogAiImagesEnabled(env);
export const chatbotEnabled = (env: AppEnv = getEnv()): boolean => core.chatbotEnabled(env);
