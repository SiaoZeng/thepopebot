#!/usr/bin/env node
import { readFileSync } from 'fs';

const [cmd, key, inlineValue] = process.argv.slice(2);

// Default to list
if (!cmd || cmd === 'list') {
  const secretsJson = process.env.AGENT_JOB_SECRETS;
  if (!secretsJson) {
    console.log('No agent secrets configured.');
    process.exit(0);
  }
  const secrets = JSON.parse(secretsJson);
  const keys = Object.keys(secrets);
  if (keys.length === 0) {
    console.log('No agent secrets configured.');
  } else {
    console.log('Available secrets:');
    keys.forEach(k => {
      const fetchRequired = secrets[k] === null;
      console.log(`  - ${k}${fetchRequired ? '  (fetch required: use get)' : ''}`);
    });
    console.log('\nTo get a value: agent-job-secrets.js get KEY_NAME');
  }
  process.exit(0);
}

const apiKey = process.env.AGENT_JOB_TOKEN;
const appUrl = process.env.APP_URL;
if (!apiKey) { console.error('AGENT_JOB_TOKEN not available'); process.exit(1); }
if (!appUrl) { console.error('APP_URL not available'); process.exit(1); }

if (cmd === 'get') {
  if (!key) { console.error('Usage: agent-job-secrets.js get KEY_NAME'); process.exit(1); }
  const res = await fetch(`${appUrl}/api/get-agent-secret?key=${encodeURIComponent(key)}`, {
    headers: { 'x-api-key': apiKey },
  });
  const json = await res.json();
  if (!res.ok || json.error) { console.error('Failed:', json.error || res.status); process.exit(1); }
  console.log(json.value);
  process.exit(0);
}

if (cmd === 'set') {
  if (!key) {
    console.error('Usage: agent-job-secrets.js set KEY_NAME [value]');
    console.error('       echo "value" | agent-job-secrets.js set KEY_NAME');
    process.exit(1);
  }
  let value = inlineValue;
  if (value === undefined) {
    value = readFileSync('/dev/stdin', 'utf8').trim();
  }
  const res = await fetch(`${appUrl}/api/set-agent-secret`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey },
    body: JSON.stringify({ key, value }),
  });
  const json = await res.json();
  if (!res.ok || json.error) { console.error('Failed:', json.error || res.status); process.exit(1); }
  console.log(`Secret "${key}" updated.`);
  process.exit(0);
}

console.error(`Unknown command: ${cmd}`);
process.exit(1);
