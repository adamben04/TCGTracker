import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import sqlite3 from 'sqlite3';
import { pipeline } from 'stream/promises';
import { createGzip, createGunzip } from 'zlib';
import { Agent, fetch as undiciFetch, type Dispatcher } from 'undici';
import { env } from '../config/env';
import { getDb, getDatabasePath, isDatabaseOpen } from '../db/database';
import { logger } from '../utils/logger';

interface CloudBackupResult {
  enabled: boolean;
  uploaded: boolean;
  message: string;
  backupKey?: string;
  latestKey?: string;
  backupId?: string;
}

export interface ChunkedBackupManifest {
  version: 2;
  format: 'gzip-chunks';
  backupId: string;
  runDate: string;
  generatedAt: string;
  originalBytes: number;
  compressedBytes: number;
  chunkCount: number;
  chunkBytes: number;
  prefix: string;
  databaseSha256: string;
  compressedSha256: string;
  chunkSha256: string[];
}

interface LatestBackupPointer {
  version: 1;
  format: 'backup-manifest-pointer';
  backupId: string;
  generatedAt: string;
  manifestKey: string;
  manifestSha256: string;
}

interface DatabaseValidationResult {
  healthy: boolean;
  message?: string;
}

const LARGE_TRANSFER_TIMEOUT_MS = 60 * 60 * 1000;
// Supabase free tier rejects single objects above ~50 MB.
const MAX_CHUNK_BYTES = 45 * 1024 * 1024;
const SHA256_HEX_PATTERN = /^[a-f0-9]{64}$/;

const largeTransferAgent: Dispatcher = new Agent({
  headersTimeout: LARGE_TRANSFER_TIMEOUT_MS,
  bodyTimeout: LARGE_TRANSFER_TIMEOUT_MS,
  connectTimeout: 60_000,
});

let backupInFlight: Promise<CloudBackupResult> | null = null;
let restoreInFlight: Promise<CloudRestoreResult> | null = null;

const normalizeBaseUrl = (url: string) => url.replace(/\/+$/, '');

const toStorageObjectPath = (objectKey: string): string =>
  objectKey
    .split('/')
    .map((segment) => encodeURIComponent(segment))
    .join('/');

const getStorageUploadUrl = (objectKey: string) => {
  if (!env.cloud.supabaseUrl || !env.cloud.serviceRoleKey) {
    throw new Error('Supabase cloud sync is not configured');
  }
  const storagePath = toStorageObjectPath(objectKey);
  return `${normalizeBaseUrl(env.cloud.supabaseUrl)}/storage/v1/object/${env.cloud.bucket}/${storagePath}`;
};

const getStorageDownloadUrl = (objectKey: string) => getStorageUploadUrl(objectKey);

const uploadObject = async (
  objectKey: string,
  body: Buffer | string,
  contentType: string,
  upsert = false
) => {
  const url = getStorageUploadUrl(objectKey);
  const response = await undiciFetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.cloud.serviceRoleKey!}`,
      apikey: env.cloud.serviceRoleKey!,
      'x-upsert': String(upsert),
      'Content-Type': contentType,
    },
    body,
    dispatcher: largeTransferAgent,
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => response.statusText);
    throw new Error(`Cloud upload failed (${response.status}): ${errorText}`);
  }
};

const uploadFileObject = async (
  objectKey: string,
  filePath: string,
  contentType: string,
  upsert = false
) => {
  const stats = fs.statSync(filePath);
  const body = fs.createReadStream(filePath);
  const url = getStorageUploadUrl(objectKey);

  logger.info('Starting cloud file upload', {
    objectKey,
    sizeMb: (stats.size / 1024 / 1024).toFixed(1),
  });

  const response = await undiciFetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.cloud.serviceRoleKey!}`,
      apikey: env.cloud.serviceRoleKey!,
      'x-upsert': String(upsert),
      'Content-Type': contentType,
      'Content-Length': String(stats.size),
    },
    body: body as unknown as BodyInit,
    duplex: 'half',
    dispatcher: largeTransferAgent,
  } as Parameters<typeof undiciFetch>[1]);

  if (!response.ok) {
    const errorText = await response.text().catch(() => response.statusText);
    throw new Error(`Cloud upload failed (${response.status}): ${errorText}`);
  }
};

const downloadObject = async (objectKey: string): Promise<Buffer> => {
  const url = getStorageDownloadUrl(objectKey);
  const response = await undiciFetch(url, {
    headers: {
      Authorization: `Bearer ${env.cloud.serviceRoleKey!}`,
      apikey: env.cloud.serviceRoleKey!,
    },
    dispatcher: largeTransferAgent,
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => response.statusText);
    throw new Error(`Cloud download failed (${response.status}): ${errorText}`);
  }

  return Buffer.from(await response.arrayBuffer());
};

const execSql = (database: sqlite3.Database, sql: string): Promise<void> =>
  new Promise((resolve, reject) => {
    database.exec(sql, (error) => {
      if (error) reject(error);
      else resolve();
    });
  });

const closeSqliteDatabase = (database: sqlite3.Database): Promise<void> =>
  new Promise((resolve, reject) => {
    database.close((error) => {
      if (error) reject(error);
      else resolve();
    });
  });

const openSqliteDatabase = (databasePath: string, mode?: number): Promise<sqlite3.Database> =>
  new Promise((resolve, reject) => {
    const database =
      mode === undefined
        ? new sqlite3.Database(databasePath)
        : new sqlite3.Database(databasePath, mode);
    database.once('open', () => resolve(database));
    database.once('error', reject);
  });

const getSqliteValue = (database: sqlite3.Database, sql: string): Promise<unknown> =>
  new Promise((resolve, reject) => {
    database.get(sql, (error, row: Record<string, unknown> | undefined) => {
      if (error) {
        reject(error);
        return;
      }
      resolve(row ? Object.values(row)[0] : undefined);
    });
  });

const quoteSqlLiteral = (value: string) => `'${value.replace(/'/g, "''")}'`;

const removePathIfExists = (targetPath: string) => {
  if (fs.existsSync(targetPath)) {
    fs.rmSync(targetPath, { recursive: true, force: true });
  }
};

const sha256Buffer = (value: Buffer | string) =>
  crypto.createHash('sha256').update(value).digest('hex');

const sha256File = (filePath: string): Promise<string> =>
  new Promise((resolve, reject) => {
    const hash = crypto.createHash('sha256');
    const input = fs.createReadStream(filePath);
    input.on('data', (chunk: Buffer | string) => hash.update(chunk));
    input.on('error', reject);
    input.on('end', () => resolve(hash.digest('hex')));
  });

const createWorkDirectory = (databasePath: string, purpose: 'backup' | 'restore') => {
  const databaseDirectory = path.dirname(path.resolve(databasePath));
  return fs.mkdtempSync(path.join(databaseDirectory, `.tcgtracker-${purpose}-`));
};

const createBackupId = (runDate: string) => {
  const safeRunDate = runDate.replace(/[^0-9A-Za-z_-]/g, '') || 'backup';
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  return `${safeRunDate}-${timestamp}-${crypto.randomBytes(6).toString('hex')}`;
};

const isSafeStorageKey = (key: string) =>
  key.length > 0 &&
  !key.startsWith('/') &&
  !key.includes('\\') &&
  !key.split('/').some((segment) => segment === '' || segment === '.' || segment === '..');

const isPositiveInteger = (value: unknown) =>
  typeof value === 'number' && Number.isSafeInteger(value) && value > 0;

export const validateChunkedBackupManifest = (value: unknown): ChunkedBackupManifest => {
  if (!value || typeof value !== 'object') {
    throw new Error('Backup manifest must be an object');
  }

  const manifest = value as Partial<ChunkedBackupManifest>;
  if (manifest.version !== 2 || manifest.format !== 'gzip-chunks') {
    throw new Error('Unsupported or unsigned backup manifest');
  }
  if (
    typeof manifest.backupId !== 'string' ||
    !/^[A-Za-z0-9_-]+$/.test(manifest.backupId) ||
    typeof manifest.runDate !== 'string' ||
    typeof manifest.generatedAt !== 'string' ||
    Number.isNaN(Date.parse(manifest.generatedAt))
  ) {
    throw new Error('Backup manifest identity is invalid');
  }
  if (
    !isPositiveInteger(manifest.originalBytes) ||
    !isPositiveInteger(manifest.compressedBytes) ||
    !isPositiveInteger(manifest.chunkCount) ||
    !isPositiveInteger(manifest.chunkBytes) ||
    typeof manifest.prefix !== 'string' ||
    !isSafeStorageKey(manifest.prefix.slice(0, -1)) ||
    !manifest.prefix.endsWith('/') ||
    manifest.prefix !== `backups/tcg-prices-${manifest.backupId}/chunks/`
  ) {
    throw new Error('Backup manifest storage metadata is invalid');
  }
  if (
    typeof manifest.databaseSha256 !== 'string' ||
    typeof manifest.compressedSha256 !== 'string' ||
    !SHA256_HEX_PATTERN.test(manifest.databaseSha256) ||
    !SHA256_HEX_PATTERN.test(manifest.compressedSha256) ||
    !Array.isArray(manifest.chunkSha256) ||
    manifest.chunkSha256.length !== manifest.chunkCount ||
    manifest.chunkSha256.some(
      (checksum) => typeof checksum !== 'string' || !SHA256_HEX_PATTERN.test(checksum)
    )
  ) {
    throw new Error('Backup manifest checksums are invalid');
  }

  return manifest as ChunkedBackupManifest;
};

const validateLatestBackupPointer = (value: unknown): LatestBackupPointer => {
  if (!value || typeof value !== 'object') {
    throw new Error('Latest backup pointer must be an object');
  }

  const pointer = value as Partial<LatestBackupPointer>;
  if (
    pointer.version !== 1 ||
    pointer.format !== 'backup-manifest-pointer' ||
    typeof pointer.backupId !== 'string' ||
    !/^[A-Za-z0-9_-]+$/.test(pointer.backupId) ||
    typeof pointer.generatedAt !== 'string' ||
    Number.isNaN(Date.parse(pointer.generatedAt)) ||
    typeof pointer.manifestKey !== 'string' ||
    !isSafeStorageKey(pointer.manifestKey) ||
    pointer.manifestKey !== `backups/tcg-prices-${pointer.backupId}/manifest.json` ||
    typeof pointer.manifestSha256 !== 'string' ||
    !SHA256_HEX_PATTERN.test(pointer.manifestSha256)
  ) {
    throw new Error('Latest backup pointer is invalid');
  }
  return pointer as LatestBackupPointer;
};

/**
 * Check a database without opening the application's shared connection. It is
 * used before boot-time restore decisions and before any destructive swap.
 */
export const validateSqliteDatabaseFile = async (
  databasePath: string,
  mode: 'quick' | 'full' = 'full'
): Promise<DatabaseValidationResult> => {
  if (!fs.existsSync(databasePath) || fs.statSync(databasePath).size === 0) {
    return { healthy: false, message: 'Database file is missing or empty' };
  }

  let database: sqlite3.Database | null = null;
  try {
    database = await openSqliteDatabase(databasePath, sqlite3.OPEN_READONLY);
    const pragma = mode === 'quick' ? 'PRAGMA quick_check' : 'PRAGMA integrity_check';
    const integrityResult = await getSqliteValue(database, pragma);
    if (integrityResult !== 'ok') {
      return { healthy: false, message: `${pragma} returned ${String(integrityResult)}` };
    }
    return { healthy: true };
  } catch (error) {
    return { healthy: false, message: (error as Error).message };
  } finally {
    if (database) {
      try {
        await closeSqliteDatabase(database);
      } catch (error) {
        logger.warn('Failed to close SQLite integrity-check connection', {
          error: (error as Error).message,
        });
      }
    }
  }
};

export const isSqliteDatabaseFileHealthy = async (databasePath: string) =>
  (await validateSqliteDatabaseFile(databasePath)).healthy;

const createConsistentSnapshot = async (sourcePath: string, snapshotPath: string) => {
  const resolvedSourcePath = path.resolve(sourcePath);
  const isApplicationDatabase = resolvedSourcePath === path.resolve(getDatabasePath());
  let database: sqlite3.Database;
  let closeWhenFinished = false;

  if (isApplicationDatabase && isDatabaseOpen()) {
    database = getDb();
  } else {
    database = await openSqliteDatabase(resolvedSourcePath, sqlite3.OPEN_READWRITE);
    closeWhenFinished = true;
  }

  try {
    try {
      await execSql(database, 'PRAGMA wal_checkpoint(PASSIVE)');
    } catch (error) {
      logger.warn(
        'WAL checkpoint before cloud backup was busy; creating SQLite snapshot directly',
        {
          error: (error as Error).message,
        }
      );
    }
    await execSql(database, `VACUUM INTO ${quoteSqlLiteral(snapshotPath)}`);
  } finally {
    if (closeWhenFinished) {
      await closeSqliteDatabase(database);
    }
  }
};

const compressDatabaseToGzip = async (dbPath: string, gzipPath: string) => {
  logger.info('Compressing SQLite snapshot for cloud upload...', {
    sourceMb: (fs.statSync(dbPath).size / 1024 / 1024).toFixed(1),
  });
  await pipeline(
    fs.createReadStream(dbPath),
    createGzip({ level: 6 }),
    fs.createWriteStream(gzipPath)
  );
};

const splitFileIntoChunks = (filePath: string, chunkSize: number, outDir: string): string[] => {
  fs.mkdirSync(outDir, { recursive: true });
  const stats = fs.statSync(filePath);
  const fd = fs.openSync(filePath, 'r');
  const chunkPaths: string[] = [];

  try {
    let offset = 0;
    let index = 0;
    while (offset < stats.size) {
      const size = Math.min(chunkSize, stats.size - offset);
      const chunkPath = path.join(outDir, `${String(index).padStart(4, '0')}.part`);
      const buffer = Buffer.alloc(size);
      fs.readSync(fd, buffer, 0, size, offset);
      fs.writeFileSync(chunkPath, buffer);
      chunkPaths.push(chunkPath);
      offset += size;
      index += 1;
    }
  } finally {
    fs.closeSync(fd);
  }

  return chunkPaths;
};

const uploadChunkedDatabase = async (
  dbPath: string,
  runDate: string,
  source: 'manual_upload' | 'scheduled_backup'
): Promise<CloudBackupResult> => {
  const tempRoot = createWorkDirectory(dbPath, 'backup');
  const snapshotPath = path.join(tempRoot, 'database.snapshot.db');
  const gzipPath = path.join(tempRoot, 'database.db.gz');
  const chunkDir = path.join(tempRoot, 'chunks');

  try {
    await createConsistentSnapshot(dbPath, snapshotPath);
    const originalBytes = fs.statSync(snapshotPath).size;
    const databaseSha256 = await sha256File(snapshotPath);
    await compressDatabaseToGzip(snapshotPath, gzipPath);

    const compressedBytes = fs.statSync(gzipPath).size;
    const compressedSha256 = await sha256File(gzipPath);
    const chunkPaths = splitFileIntoChunks(gzipPath, MAX_CHUNK_BYTES, chunkDir);
    const chunkSha256 = await Promise.all(chunkPaths.map(sha256File));

    const backupId = createBackupId(runDate);
    const backupRoot = `backups/tcg-prices-${backupId}`;
    const backupPrefix = `${backupRoot}/chunks/`;
    for (let i = 0; i < chunkPaths.length; i += 1) {
      const chunkName = `${String(i).padStart(4, '0')}.part`;
      await uploadFileObject(
        `${backupPrefix}${chunkName}`,
        chunkPaths[i],
        'application/octet-stream'
      );
    }

    const manifest: ChunkedBackupManifest = {
      version: 2,
      format: 'gzip-chunks',
      backupId,
      runDate,
      generatedAt: new Date().toISOString(),
      originalBytes,
      compressedBytes,
      chunkCount: chunkPaths.length,
      chunkBytes: MAX_CHUNK_BYTES,
      prefix: backupPrefix,
      databaseSha256,
      compressedSha256,
      chunkSha256,
    };
    const manifestJson = JSON.stringify(manifest);
    const manifestKey = `${backupRoot}/manifest.json`;
    await uploadObject(manifestKey, manifestJson, 'application/json');

    const latestPointer: LatestBackupPointer = {
      version: 1,
      format: 'backup-manifest-pointer',
      backupId,
      generatedAt: manifest.generatedAt,
      manifestKey,
      manifestSha256: sha256Buffer(manifestJson),
    };
    await uploadObject(
      'latest/manifest.json',
      JSON.stringify(latestPointer),
      'application/json',
      true
    );

    const metadata = {
      backupId,
      runDate,
      generatedAt: manifest.generatedAt,
      databasePath: path.basename(dbPath),
      databaseBytes: originalBytes,
      compressedBytes,
      chunkCount: chunkPaths.length,
      source,
      format: manifest.format,
      manifestKey,
    };
    const metadataJson = JSON.stringify(metadata);
    await uploadObject(`metadata/backup-${backupId}.json`, metadataJson, 'application/json');
    await uploadObject('metadata/latest.json', metadataJson, 'application/json', true);

    return {
      enabled: true,
      uploaded: true,
      message: `Uploaded ${(originalBytes / 1024 / 1024).toFixed(1)} MB SQLite snapshot as ${chunkPaths.length} compressed chunks (${(compressedBytes / 1024 / 1024).toFixed(1)} MB gzip).`,
      backupKey: manifestKey,
      latestKey: 'latest/manifest.json',
      backupId,
    };
  } finally {
    removePathIfExists(tempRoot);
  }
};

export const replaceDatabaseWithVerifiedCandidate = async (
  candidatePath: string,
  databasePath: string
): Promise<{ previousDatabasePath?: string }> => {
  const resolvedCandidatePath = path.resolve(candidatePath);
  const resolvedDatabasePath = path.resolve(databasePath);
  if (path.dirname(resolvedCandidatePath) !== path.dirname(resolvedDatabasePath)) {
    throw new Error('Restore candidate must be on the same filesystem as the database');
  }

  const validation = await validateSqliteDatabaseFile(resolvedCandidatePath);
  if (!validation.healthy) {
    throw new Error(`Restored database failed integrity verification: ${validation.message}`);
  }

  const retainedPath = `${resolvedDatabasePath}.pre-restore-${new Date().toISOString().replace(/[:.]/g, '-')}-${crypto.randomBytes(4).toString('hex')}`;
  const originalPaths = [
    `${resolvedDatabasePath}-wal`,
    `${resolvedDatabasePath}-shm`,
    resolvedDatabasePath,
  ];
  const movedPaths: Array<{ originalPath: string; retainedPath: string }> = [];

  try {
    for (const originalPath of originalPaths) {
      if (!fs.existsSync(originalPath)) continue;
      const retainedSidecarPath =
        originalPath === resolvedDatabasePath
          ? retainedPath
          : `${retainedPath}${originalPath.slice(resolvedDatabasePath.length)}`;
      fs.renameSync(originalPath, retainedSidecarPath);
      movedPaths.push({ originalPath, retainedPath: retainedSidecarPath });
    }
    fs.renameSync(resolvedCandidatePath, resolvedDatabasePath);
  } catch (error) {
    for (const movedPath of movedPaths.reverse()) {
      if (fs.existsSync(movedPath.retainedPath) && !fs.existsSync(movedPath.originalPath)) {
        fs.renameSync(movedPath.retainedPath, movedPath.originalPath);
      }
    }
    throw error;
  }

  return {
    previousDatabasePath: movedPaths.some(
      (movedPath) => movedPath.originalPath === resolvedDatabasePath
    )
      ? retainedPath
      : undefined,
  };
};

const restoreFromChunkedManifest = async (
  manifest: ChunkedBackupManifest
): Promise<CloudRestoreResult> => {
  const dbPath = getDatabasePath();
  const tempRoot = createWorkDirectory(dbPath, 'restore');
  const gzipPath = path.join(tempRoot, 'database.db.gz');
  const candidatePath = path.join(
    path.dirname(dbPath),
    `${path.basename(dbPath)}.restore-candidate-${crypto.randomBytes(8).toString('hex')}.db`
  );

  try {
    const gzipFd = fs.openSync(gzipPath, 'w');
    try {
      let receivedBytes = 0;
      for (let i = 0; i < manifest.chunkCount; i += 1) {
        const chunkName = `${String(i).padStart(4, '0')}.part`;
        const chunkKey = `${manifest.prefix}${chunkName}`;
        logger.info('Downloading cloud chunk', {
          chunkKey,
          index: i + 1,
          total: manifest.chunkCount,
        });
        const chunk = await downloadObject(chunkKey);
        if (sha256Buffer(chunk) !== manifest.chunkSha256[i]) {
          throw new Error(`Checksum mismatch for cloud backup chunk ${i + 1}`);
        }
        receivedBytes += chunk.length;
        fs.writeSync(gzipFd, chunk);
      }
      if (receivedBytes !== manifest.compressedBytes) {
        throw new Error(
          `Compressed backup size mismatch: expected ${manifest.compressedBytes}, got ${receivedBytes}`
        );
      }
    } finally {
      fs.closeSync(gzipFd);
    }

    if ((await sha256File(gzipPath)) !== manifest.compressedSha256) {
      throw new Error('Compressed cloud backup checksum mismatch');
    }

    await pipeline(
      fs.createReadStream(gzipPath),
      createGunzip(),
      fs.createWriteStream(candidatePath)
    );
    const restoredBytes = fs.statSync(candidatePath).size;
    if (restoredBytes !== manifest.originalBytes) {
      throw new Error(
        `Restored backup size mismatch: expected ${manifest.originalBytes}, got ${restoredBytes}`
      );
    }
    if ((await sha256File(candidatePath)) !== manifest.databaseSha256) {
      throw new Error('Restored cloud backup checksum mismatch');
    }

    const swapResult = await replaceDatabaseWithVerifiedCandidate(candidatePath, dbPath);
    return {
      enabled: true,
      restored: true,
      message: `Restored ${(restoredBytes / 1024 / 1024).toFixed(1)} MB from ${manifest.chunkCount} verified cloud chunks.`,
      latestKey: 'latest/manifest.json',
      databaseBytes: restoredBytes,
      previousDatabasePath: swapResult.previousDatabasePath,
    };
  } finally {
    removePathIfExists(candidatePath);
    removePathIfExists(tempRoot);
  }
};

const resolveManifest = async (objectKey: string): Promise<ChunkedBackupManifest> => {
  if (!isSafeStorageKey(objectKey)) {
    throw new Error('Invalid cloud backup object key');
  }

  const requestedManifestBuffer = await downloadObject(objectKey);
  const requestedManifest = JSON.parse(requestedManifestBuffer.toString('utf8')) as unknown;
  if (objectKey === 'latest/manifest.json') {
    const pointer = validateLatestBackupPointer(requestedManifest);
    const manifestBuffer = await downloadObject(pointer.manifestKey);
    if (sha256Buffer(manifestBuffer) !== pointer.manifestSha256) {
      throw new Error('Latest backup manifest checksum mismatch');
    }
    return validateChunkedBackupManifest(JSON.parse(manifestBuffer.toString('utf8')));
  }
  return validateChunkedBackupManifest(requestedManifest);
};

export const isCloudConfigured = () =>
  env.cloud.enabled &&
  Boolean(env.cloud.supabaseUrl) &&
  Boolean(env.cloud.serviceRoleKey) &&
  Boolean(env.cloud.bucket);

export const runBackupSingleFlight = (
  operation: () => Promise<CloudBackupResult>
): Promise<CloudBackupResult> => {
  if (backupInFlight) {
    logger.info('Cloud backup already in progress; joining active backup.');
    return backupInFlight;
  }

  const operationPromise = Promise.resolve().then(operation);
  backupInFlight = operationPromise;
  operationPromise.then(
    () => {
      if (backupInFlight === operationPromise) backupInFlight = null;
    },
    () => {
      if (backupInFlight === operationPromise) backupInFlight = null;
    }
  );
  return operationPromise;
};

export const uploadDatabaseFileToCloud = async (
  dbPath: string,
  runDate: string
): Promise<CloudBackupResult> => {
  if (!isCloudConfigured()) {
    return {
      enabled: false,
      uploaded: false,
      message: 'Cloud sync disabled or Supabase credentials missing.',
    };
  }

  const resolvedPath = path.resolve(dbPath);
  if (!fs.existsSync(resolvedPath)) {
    return {
      enabled: true,
      uploaded: false,
      message: `Database file not found: ${resolvedPath}`,
    };
  }

  return runBackupSingleFlight(async () => {
    try {
      return await uploadChunkedDatabase(resolvedPath, runDate, 'manual_upload');
    } catch (error) {
      logger.error('Manual cloud database upload failed', { error: (error as Error).message });
      return {
        enabled: true,
        uploaded: false,
        message: `Cloud backup failed: ${(error as Error).message}`,
      };
    }
  });
};

export interface CloudRestoreResult {
  enabled: boolean;
  restored: boolean;
  message: string;
  latestKey?: string;
  databaseBytes?: number;
  previousDatabasePath?: string;
}

export const restoreDatabaseFromCloud = async (
  objectKey = 'latest/manifest.json'
): Promise<CloudRestoreResult> => {
  if (!isCloudConfigured()) {
    return {
      enabled: false,
      restored: false,
      message: 'Cloud sync disabled or Supabase credentials missing.',
    };
  }
  if (isDatabaseOpen()) {
    return {
      enabled: true,
      restored: false,
      message:
        'Refusing to restore while the SQLite database is open. Stop the backend before restoring.',
    };
  }
  if (restoreInFlight) return restoreInFlight;

  const operation = (async () => {
    try {
      const manifest = await resolveManifest(objectKey);
      return await restoreFromChunkedManifest(manifest);
    } catch (error) {
      logger.error('Cloud database restore failed', { error: (error as Error).message });
      return {
        enabled: true,
        restored: false,
        message: `Cloud restore failed: ${(error as Error).message}`,
      };
    }
  })();
  restoreInFlight = operation;
  operation.then(
    () => {
      if (restoreInFlight === operation) restoreInFlight = null;
    },
    () => {
      if (restoreInFlight === operation) restoreInFlight = null;
    }
  );
  return operation;
};

export const backupDatabaseToCloud = async (runDate: string): Promise<CloudBackupResult> => {
  if (!isCloudConfigured()) {
    return {
      enabled: false,
      uploaded: false,
      message: 'Cloud sync disabled or Supabase credentials missing.',
    };
  }

  return runBackupSingleFlight(async () => {
    try {
      const dbPath = getDatabasePath();
      const result = await uploadChunkedDatabase(dbPath, runDate, 'scheduled_backup');
      logger.info('Cloud database backup uploaded successfully', {
        backupKey: result.backupKey,
        latestKey: result.latestKey,
        message: result.message,
      });
      return result;
    } catch (error) {
      logger.error('Cloud database backup failed', { error: (error as Error).message });
      return {
        enabled: true,
        uploaded: false,
        message: `Cloud backup failed: ${(error as Error).message}`,
      };
    }
  });
};

export const getCloudBackupStatus = async () => {
  if (!isCloudConfigured()) {
    return {
      enabled: false,
      provider: 'supabase-storage',
      bucket: env.cloud.bucket,
      configured: false,
      message: 'Set CLOUD_SYNC_ENABLED=true and SUPABASE credentials to enable cloud backups.',
    };
  }

  const db = getDb();
  const lastRun = await new Promise<any>((resolve, reject) => {
    db.get(
      `SELECT runDate, status, startedAt, completedAt, message
       FROM sync_runs
       WHERE runType = 'price_update'
       ORDER BY id DESC
       LIMIT 1`,
      [],
      (err, row) => {
        if (err) reject(err);
        else resolve(row || null);
      }
    );
  });

  return {
    enabled: true,
    configured: true,
    provider: 'supabase-storage',
    bucket: env.cloud.bucket,
    format: 'gzip-chunks-v2',
    maxChunkMb: MAX_CHUNK_BYTES / 1024 / 1024,
    lastPriceUpdate: lastRun,
  };
};
