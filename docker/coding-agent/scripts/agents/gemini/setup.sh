#!/bin/bash
# Gemini CLI setup — trust, auth config, system prompt, Playwright MCP

WORKSPACE_DIR=$(pwd)

mkdir -p ~/.gemini

# ── Trust the workspace folder so Gemini CLI skips the interactive prompt ──
cat > ~/.gemini/trustedFolders.json <<TRUST
{
  "$WORKSPACE_DIR": "TRUST_FOLDER"
}
TRUST

# ── Configure settings.json so the CLI uses the API key without prompting ──
if [ -n "$GOOGLE_API_KEY" ]; then
    cat > ~/.gemini/settings.json <<SETTINGS
{
  "security": {
    "auth": {
      "selectedType": "gemini-api-key"
    }
  }
}
SETTINGS
fi

# ── Write system prompt if provided ──
if [ -n "$SYSTEM_PROMPT" ]; then
    echo "$SYSTEM_PROMPT" > ~/.gemini/SYSTEM.md
    export GEMINI_SYSTEM_MD=~/.gemini/SYSTEM.md
else
    rm -f ~/.gemini/SYSTEM.md
fi

# ── Register Playwright MCP server for browser automation ──
gemini mcp add playwright -- npx -y @playwright/mcp@latest --headless --browser chromium 2>/dev/null || true
