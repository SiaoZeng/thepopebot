import path from 'path';
import { clusterDataDir } from '../paths.js';
import { inspectContainer, stopContainer as dockerStopContainer, removeContainer, runClusterWorkerContainer } from '../tools/docker.js';
import { getWorkerWithClusterAndRole, getClusterWorkersByCluster, getClusterRoleById, workerShortId } from '../db/clusters.js';

/**
 * Sanitize a string for use in branch names.
 * @param {string} str
 * @returns {string}
 */
function sanitizeName(str) {
  return str.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

/**
 * Compute naming for a cluster's Docker resources.
 * Uses only the cluster ID for rename-safe naming.
 * @param {object} cluster
 * @returns {{ project: string, dataDir: string }}
 */
export function clusterNaming(cluster) {
  const shortId = cluster.id.replace(/-/g, '').slice(0, 8);
  const project = `cluster-${shortId}`;
  return { project, dataDir: path.join(clusterDataDir, project) };
}

/**
 * Compute the container name for a worker.
 * @param {string} project - Docker project prefix
 * @param {object} worker
 * @returns {string}
 */
function workerContainerName(project, worker) {
  return `${project}-worker-${workerShortId(worker)}`;
}

/**
 * Get the data directory path for a cluster.
 */
export function clusterDir(cluster) {
  const shortId = cluster.id.replace(/-/g, '').slice(0, 8);
  return path.join(clusterDataDir, `cluster-${shortId}`);
}

/**
 * Get the data directory path for a worker within a cluster.
 */
export function workerDir(cluster, worker) {
  return path.join(clusterDir(cluster), workerShortId(worker));
}

/**
 * Check if a worker's container is currently running.
 * @param {string} containerName
 * @returns {Promise<boolean>}
 */
async function isContainerRunning(containerName) {
  try {
    const info = await inspectContainer(containerName);
    return info?.State?.Running === true;
  } catch {
    return false;
  }
}

/**
 * Stop a worker's Docker container and remove it.
 * @param {string} workerId
 */
export async function stopWorkerContainer(workerId) {
  const worker = getWorkerWithClusterAndRole(workerId);
  if (!worker || !worker.cluster) return;

  const { project } = clusterNaming(worker.cluster);
  const containerName = workerContainerName(project, worker);
  await dockerStopContainer(containerName);
  await removeContainer(containerName);
}

/**
 * Build the full system prompt for a worker container.
 * Composes: cluster system prompt + workspace tree + worker identity + role.
 */
function buildWorkerPrompt(cluster, worker) {
  const sections = [];

  // Section A: Cluster system prompt
  if (cluster.systemPrompt) {
    sections.push(cluster.systemPrompt.trim());
  }

  // Section B: Workspace directory tree
  const allWorkers = getClusterWorkersByCluster(cluster.id);
  const clusterFolders = cluster.folders ? JSON.parse(cluster.folders) : [];
  const currentShortId = workerShortId(worker);

  const treeLines = [];
  // Shared folders
  treeLines.push('shared/');
  for (const folder of clusterFolders) {
    treeLines.push(`  ${folder}/`);
  }
  // Worker directories
  for (const w of allWorkers) {
    const wShortId = workerShortId(w);
    const roleName = w.clusterRoleId ? getClusterRoleById(w.clusterRoleId)?.roleName : null;
    const label = roleName ? `${w.name} (${roleName})` : w.name;
    const youMarker = wShortId === currentShortId ? ' ← you' : '';
    treeLines.push(`${wShortId}/    ${label}${youMarker}`);
    const wFolders = w.folders ? JSON.parse(w.folders) : [];
    for (const folder of wFolders) {
      treeLines.push(`  ${folder}/`);
    }
  }

  sections.push(`## Workspace Structure

Your workspace is at /home/claude-code/workspace with this layout:

${treeLines.join('\n')}`);

  // Section C: Worker identity
  sections.push(`## Your Identity

Name: ${worker.name}
ID: ${currentShortId}
Directory: ${currentShortId}/`);

  // Section D: Role (if assigned)
  if (worker.role?.role) {
    sections.push(`## Your Role

${worker.role.role.trim()}`);
  }

  return sections.join('\n\n');
}

/**
 * Launch a cluster worker container.
 * @param {string} workerId
 * @param {object} [context] - Optional context (e.g. webhook payload)
 * @returns {Promise<{ busy: boolean, containerName?: string, error?: string }>}
 */
export async function runClusterWorker(workerId, context = {}) {
  const worker = getWorkerWithClusterAndRole(workerId);
  if (!worker || !worker.cluster) {
    return { busy: false, error: 'Worker or cluster not found' };
  }

  const { cluster } = worker;
  const { project } = clusterNaming(cluster);
  const containerName = workerContainerName(project, worker);
  const dataDir = clusterDir(cluster);

  if (await isContainerRunning(containerName)) {
    console.log(`[cluster] Worker ${worker.name} (${containerName}) is busy, skipping`);
    return { busy: true, containerName };
  }

  const prompt = buildWorkerPrompt(cluster, worker);

  const env = [];
  if (prompt) {
    env.push(`HEADLESS_TASK=${prompt}`);
  }
  if (process.env.CLAUDE_CODE_OAUTH_TOKEN) {
    env.push(`CLAUDE_CODE_OAUTH_TOKEN=${process.env.CLAUDE_CODE_OAUTH_TOKEN}`);
  }
  if (process.env.GH_TOKEN) {
    env.push(`GH_TOKEN=${process.env.GH_TOKEN}`);
  }

  const binds = [`${dataDir}:/home/claude-code/workspace`];

  console.log(`[cluster] Launching worker ${worker.name} (${containerName})`);

  try {
    await runClusterWorkerContainer({ containerName, env, binds });
  } catch (err) {
    console.error(`[cluster] Failed to launch worker ${containerName}:`, err.message);
    return { busy: false, containerName, error: err.message };
  }

  return { busy: false, containerName };
}

/**
 * Check if a specific worker is currently running.
 * @param {string} workerId
 * @returns {Promise<boolean>}
 */
export async function isWorkerRunning(workerId) {
  const worker = getWorkerWithClusterAndRole(workerId);
  if (!worker || !worker.cluster) return false;

  const { project } = clusterNaming(worker.cluster);
  const containerName = workerContainerName(project, worker);
  return isContainerRunning(containerName);
}
