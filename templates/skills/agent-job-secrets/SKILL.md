---
name: agent-job-secrets
description: List, get, or update agent secrets. Use get for OAuth credentials (auto-refreshed on every call). Use set to persist updated credentials back to the event handler.
---

## Usage

```bash
# List available secrets (null = must fetch, plain = already in env)
node skills/agent-job-secrets/agent-job-secrets.js

# Get a secret value (OAuth credentials are auto-refreshed)
node skills/agent-job-secrets/agent-job-secrets.js get MY_CREDENTIALS

# Set/update a secret (plain string or piped value)
node skills/agent-job-secrets/agent-job-secrets.js set MY_KEY "value"
echo "$UPDATED_CREDENTIALS" | node skills/agent-job-secrets/agent-job-secrets.js set MY_KEY
```

## Notes

- `AGENT_JOB_TOKEN` and `APP_URL` are injected automatically — no setup required
- OAuth credentials show as `null` in the list and must be fetched via `get`
- `get` on an OAuth credential refreshes it and persists the updated token immediately
- Plain secrets are available directly as env vars (e.g. `echo $MY_KEY`)
