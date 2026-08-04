# opencode-vision-fallback

Auto-describe images via a vision model when the active model lacks vision support.

When you paste/drop an image into an OpenCode session whose active model can't read images (e.g. `deepseek-v4-flash`), this plugin transparently:

1. Detects the image part in the message
2. Calls a vision-capable model (e.g. `mimo-v2.5`)
3. Replaces the image with a text description
4. Main model receives the description as plain text

No manual model switching. No "this model does not support image input" errors.

## Install

Add the plugin to your `opencode.json`:

```json
{
  "plugin": ["./opencode-vision-fallback/src/index.ts"]
}
```

Or via npm (once published):

```json
{
  "plugin": ["opencode-vision-fallback"]
}
```

## Configuration

All options are optional. Configure via the plugin options array:

```json
{
  "plugin": [["opencode-vision-fallback", {
    "vision_model": "mimo-v2.5",
    "base_url": "https://opencode.ai/zen/go/v1",
    "api_key_env": "OPENCODE_API_KEY",
    "auth_provider": "opencode-go",
    "max_tokens": 1000,
    "timeout_ms": 30000,
    "mime_prefix": "image/",
    "prompt": "Describe this image in detail. Focus on: text, UI elements, code, diagrams."
  }]]
}
```

| Option | Default | Description |
|--------|---------|-------------|
| `vision_model` | `mimo-v2.5` | Vision-capable model id |
| `base_url` | `https://opencode.ai/zen/go/v1` | OpenAI-compatible base URL |
| `api_key_env` | `OPENCODE_API_KEY` | Env var holding the API key |
| `auth_provider` | `opencode-go` | Key in `auth.json` to fall back to |
| `max_tokens` | `1000` | Description length cap |
| `timeout_ms` | `30000` | Per-image request timeout |
| `mime_prefix` | `image/` | Which file mimes to process |
| `prompt` | *(default)* | Description prompt |

## API key resolution

The plugin looks for the key in this order:

1. Env var (`api_key_env`, default `OPENCODE_API_KEY`)
2. `auth.json` under `auth_provider` key (default `opencode-go`)

The `auth.json` path is `~/.local/share/opencode/auth.json`, overridable via `OPENCODE_AUTH_FILE`.

## Logging

Logs go to OpenCode's structured log (`~/.local/share/opencode/log/opencode.log`) tagged `service: "vision-fallback"` — nothing prints into the TUI chat.

```
level=INFO message="detected 1 image(s), routing to vision model"
level=INFO message="image replaced with text description"
level=INFO message="processed 1 image(s) via vision model"
```

## How it works

Uses OpenCode's `experimental.chat.messages.transform` hook, which runs after messages are prepared but before they're sent to the LLM. The plugin mutates `output.messages` in place, replacing image `FilePart`s with text `Part`s carrying the vision description.

## License

MIT
