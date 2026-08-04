// opencode-vision-fallback
// Auto-describe images via a vision model when the active model lacks vision support.
//
// Config (all optional):
//   {
//     "vision_model": "mimo-v2.5",                       // vision-capable model id
//     "base_url": "https://opencode.ai/zen/go/v1",       // OpenAI-compatible base URL
//     "api_key_env": "OPENCODE_API_KEY",                 // env var for API key
//     "auth_provider": "opencode-go",                    // auth.json provider key
//     "max_tokens": 1000,                                // description length cap
//     "prompt": "...",                                   // custom description prompt
//     "timeout_ms": 30000,                               // per-image API timeout
//     "mime_prefix": "image/"                            // which file mimes to process
//   }

import type { Plugin, PluginOptions } from "@opencode-ai/plugin"
import fs from "fs"
import os from "os"
import path from "path"

export type VisionFallbackOptions = PluginOptions & {
  vision_model?: string
  base_url?: string
  api_key_env?: string
  auth_provider?: string
  max_tokens?: number
  prompt?: string
  timeout_ms?: number
  mime_prefix?: string
}

const DEFAULTS = {
  vision_model: "mimo-v2.5",
  base_url: "https://opencode.ai/zen/go/v1",
  api_key_env: "OPENCODE_API_KEY",
  auth_provider: "opencode-go",
  max_tokens: 1000,
  prompt:
    "Describe this image in detail. Focus on: what it shows, any text visible, UI elements, code, diagrams, or important details.",
  timeout_ms: 30_000,
  mime_prefix: "image/",
} as const

function readApiKey(options: VisionFallbackOptions): string | undefined {
  // 1. explicit env var
  const envKey = process.env[options.api_key_env ?? DEFAULTS.api_key_env]
  if (envKey) return envKey

  // 2. auth.json fallback
  try {
    const authPath = process.env.OPENCODE_AUTH_FILE || path.join(os.homedir(), ".local", "share", "opencode", "auth.json")
    const auth = JSON.parse(fs.readFileSync(authPath, "utf8"))
    return auth[options.auth_provider ?? DEFAULTS.auth_provider]?.key?.trim()
  } catch {
    return undefined
  }
}

async function describeImage(
  imageUrl: string,
  options: VisionFallbackOptions,
  apiKey: string,
): Promise<string | null> {
  const model = options.vision_model ?? DEFAULTS.vision_model
  const base = (options.base_url ?? DEFAULTS.base_url).replace(/\/+$/, "")
  const prompt = options.prompt ?? DEFAULTS.prompt
  const maxTokens = options.max_tokens ?? DEFAULTS.max_tokens
  const timeoutMs = options.timeout_ms ?? DEFAULTS.timeout_ms

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)

  try {
    const response = await fetch(`${base}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        messages: [
          {
            role: "user",
            content: [
              { type: "text", text: prompt },
              { type: "image_url", image_url: { url: imageUrl } },
            ],
          },
        ],
        max_tokens: maxTokens,
      }),
      signal: controller.signal,
    })

    if (!response.ok) {
      const errText = await response.text()
      log("error", `vision API error ${response.status}`, { error: errText.slice(0, 500) })
      return null
    }

    const result = await response.json()
    return result.choices?.[0]?.message?.content || "Image description unavailable"
  } catch (error) {
    log("error", "vision request failed", { error: String(error) })
    return null
  } finally {
    clearTimeout(timer)
  }
}

export const VisionFallbackPlugin: Plugin = async ({ client }, pluginOptions) => {
  const options = (pluginOptions ?? {}) as VisionFallbackOptions
  _client = client
  return {
    "experimental.chat.messages.transform": async (_input, output) => {
      if (!output.messages?.length) return

      let processed = 0
      const mimePrefix = options.mime_prefix ?? DEFAULTS.mime_prefix

      for (const msg of output.messages) {
        if (msg.info?.role !== "user" || !msg.parts?.length) continue

        const imageParts = msg.parts.filter(
          (p: any) => p.type === "file" && p.mime?.startsWith(mimePrefix)
        )

        if (imageParts.length === 0) continue

        log("info", `detected ${imageParts.length} image(s), routing to vision model`)

        const apiKey = readApiKey(options)
        if (!apiKey) {
          log("warn", "no API key found, images left for main model")
          continue
        }

        for (const imagePart of imageParts) {
          const imageUrl = (imagePart as any).url
          if (!imageUrl) continue

          const description = await describeImage(imageUrl, options, apiKey)
          if (description === null) continue

          const idx = msg.parts.indexOf(imagePart)
          if (idx !== -1) {
            msg.parts[idx] = {
              type: "text",
              text: `[Image: ${description}]`,
            } as any
          }
          processed++
          log("info", "image replaced with text description")
        }
      }

      if (processed > 0) log("info", `processed ${processed} image(s) via vision model`)
    },
  }
}

// Module-level logger to avoid re-instantiation per hook call.
let _client: any = null
function log(level: "info" | "warn" | "error", message: string, extra?: Record<string, unknown>) {
  try {
    _client?.app?.log?.({
      body: {
        service: "vision-fallback",
        level,
        message,
        ...(extra ? { extra } : {}),
      },
    })
  } catch {
    // silent — logging must never break the pipeline
  }
}
