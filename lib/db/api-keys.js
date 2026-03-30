import { randomUUID, randomBytes, createHash, timingSafeEqual } from 'crypto';
import { eq } from 'drizzle-orm';
import { getDb } from './index.js';
import { settings } from './schema.js';

const KEY_PREFIX = 'tpb_';

// In-memory cache: array of { id, keyHash } or null (not loaded)
let _cache = null;

/**
 * Generate a new API key: tpb_ + 64 hex chars (32 random bytes).
 * @returns {string}
 */
export function generateApiKey() {
  return KEY_PREFIX + randomBytes(32).toString('hex');
}

/**
 * Hash an API key using SHA-256.
 * @param {string} key - Raw API key
 * @returns {string} Hex digest
 */
export function hashApiKey(key) {
  return createHash('sha256').update(key).digest('hex');
}

/**
 * Lazy-load all API key hashes into the in-memory cache.
 */
function _ensureCache() {
  if (_cache !== null) return _cache;

  const db = getDb();
  const ONE_HOUR = 60 * 60 * 1000;
  const cutoff = Date.now() - ONE_HOUR;

  const rows = db
    .select()
    .from(settings)
    .where(eq(settings.type, 'api_key'))
    .all();

  const jobKeyRows = db
    .select()
    .from(settings)
    .where(eq(settings.type, 'agent_job_api_key'))
    .all()
    .filter(r => r.lastUsedAt !== null ? r.lastUsedAt > cutoff : r.createdAt > cutoff);

  _cache = [...rows, ...jobKeyRows].map((row) => {
    const parsed = JSON.parse(row.value);
    return { id: row.id, keyHash: parsed.key_hash };
  });

  return _cache;
}

/**
 * Clear the in-memory cache (call after create/delete).
 */
export function invalidateApiKeyCache() {
  _cache = null;
}

/**
 * Create a new named API key.
 * @param {string} name - Human-readable name for the key
 * @param {string} createdBy - User ID
 * @returns {{ key: string, record: object }}
 */
export function createApiKeyRecord(name, createdBy) {
  const db = getDb();

  const key = generateApiKey();
  const keyHash = hashApiKey(key);
  const keyPrefix = key.slice(0, 8); // "tpb_" + first 4 hex chars
  const now = Date.now();

  const record = {
    id: randomUUID(),
    type: 'api_key',
    key: randomUUID(), // unique identifier per key
    value: JSON.stringify({ name, key_prefix: keyPrefix, key_hash: keyHash }),
    createdBy,
    lastUsedAt: null,
    createdAt: now,
    updatedAt: now,
  };

  db.insert(settings).values(record).run();
  invalidateApiKeyCache();

  return {
    key,
    record: {
      id: record.id,
      name,
      keyPrefix,
      createdAt: now,
      lastUsedAt: null,
    },
  };
}

/**
 * List all API keys (metadata only, no hashes).
 * @returns {object[]}
 */
export function listApiKeys() {
  const db = getDb();
  const rows = db
    .select()
    .from(settings)
    .where(eq(settings.type, 'api_key'))
    .all();

  return rows.map((row) => {
    const parsed = JSON.parse(row.value);
    return {
      id: row.id,
      name: parsed.name || 'API Key',
      keyPrefix: parsed.key_prefix,
      createdAt: row.createdAt,
      lastUsedAt: row.lastUsedAt,
    };
  });
}

/**
 * Get the current API key metadata (no hash). Returns first key for backwards compat.
 * @returns {object|null}
 */
export function getApiKey() {
  const keys = listApiKeys();
  return keys.length > 0 ? keys[0] : null;
}

/**
 * Delete a specific API key by ID.
 * @param {string} id - Record ID
 */
export function deleteApiKeyById(id) {
  const db = getDb();
  db.delete(settings).where(eq(settings.id, id)).run();
  invalidateApiKeyCache();
}

/**
 * Delete all API keys (backwards compat).
 */
export function deleteApiKey() {
  const db = getDb();
  db.delete(settings).where(eq(settings.type, 'api_key')).run();
  invalidateApiKeyCache();
}

/**
 * Verify a raw API key against all cached hashes.
 * @param {string} rawKey - Raw API key from request header
 * @returns {object|null} Record if valid, null otherwise
 */
export function verifyApiKey(rawKey) {
  if (!rawKey || !rawKey.startsWith(KEY_PREFIX)) return null;

  const keyHash = hashApiKey(rawKey);
  const cached = _ensureCache();

  if (!cached || cached.length === 0) return null;

  const b = Buffer.from(keyHash, 'hex');

  for (const entry of cached) {
    const a = Buffer.from(entry.keyHash, 'hex');
    if (a.length === b.length && timingSafeEqual(a, b)) {
      // Update last_used_at column directly (non-blocking)
      try {
        const db = getDb();
        const now = Date.now();
        db.update(settings)
          .set({ lastUsedAt: now, updatedAt: now })
          .where(eq(settings.id, entry.id))
          .run();
      } catch {
        // Non-fatal: last_used_at is informational
      }
      return entry;
    }
  }

  return null;
}

/**
 * Create a per-job API key for an agent job container.
 * Stored as type 'agent_job_api_key'. Valid for 1 hour since last use.
 * @param {string} jobId - Agent job ID (stored as key column for traceability)
 * @returns {{ key: string }} The raw API key to inject into the container
 */
export function createAgentJobApiKey(jobId) {
  const db = getDb();
  const key = generateApiKey();
  const keyHash = hashApiKey(key);
  const now = Date.now();
  db.insert(settings).values({
    id: randomUUID(),
    type: 'agent_job_api_key',
    key: jobId,
    value: JSON.stringify({ key_hash: keyHash }),
    createdAt: now,
    updatedAt: now,
  }).run();
  invalidateApiKeyCache();
  return { key };
}

/**
 * Backfill lastUsedAt column from JSON value for existing api_key rows.
 * Idempotent — only processes rows that still have last_used_at in JSON.
 * Called from initDatabase().
 */
export function backfillLastUsedAt() {
  const db = getDb();
  const rows = db
    .select()
    .from(settings)
    .where(eq(settings.type, 'api_key'))
    .all();

  for (const row of rows) {
    const parsed = JSON.parse(row.value);
    if (!('last_used_at' in parsed)) continue;

    const lastUsedAt = parsed.last_used_at;
    delete parsed.last_used_at;

    db.update(settings)
      .set({
        value: JSON.stringify(parsed),
        lastUsedAt: lastUsedAt || null,
      })
      .where(eq(settings.id, row.id))
      .run();
  }
}
