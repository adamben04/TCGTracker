import fs from 'fs';
import path from 'path';
import { afterEach, describe, expect, it, jest } from '@jest/globals';
import {
  replaceDatabaseWithVerifiedCandidate,
  runBackupSingleFlight,
  validateChunkedBackupManifest,
  type ChunkedBackupManifest,
} from '../cloudBackupService';

jest.mock('../../config/env', () => ({
  env: {
    cloud: {
      enabled: false,
      supabaseUrl: undefined,
      serviceRoleKey: undefined,
      bucket: 'test',
    },
  },
}));

jest.mock('../../db/database', () => ({
  getDb: jest.fn(),
  getDatabasePath: jest.fn(() => 'test.db'),
  isDatabaseOpen: jest.fn(() => false),
}));

jest.mock('../../utils/logger', () => ({
  logger: {
    error: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
  },
}));

const testDirectories: string[] = [];

const createTestDirectory = () => {
  const directory = fs.mkdtempSync(path.join(process.cwd(), '.cloud-backup-test-'));
  testDirectories.push(directory);
  return directory;
};

afterEach(() => {
  while (testDirectories.length > 0) {
    fs.rmSync(testDirectories.pop()!, { recursive: true, force: true });
  }
});

const validManifest = (): ChunkedBackupManifest => ({
  version: 2,
  format: 'gzip-chunks',
  backupId: 'backup-20260806',
  runDate: '2026-08-06',
  generatedAt: '2026-08-06T20:00:00.000Z',
  originalBytes: 1024,
  compressedBytes: 512,
  chunkCount: 1,
  chunkBytes: 1024,
  prefix: 'backups/tcg-prices-backup-20260806/chunks/',
  databaseSha256: 'a'.repeat(64),
  compressedSha256: 'b'.repeat(64),
  chunkSha256: ['c'.repeat(64)],
});

describe('cloud backup hardening', () => {
  it('coalesces concurrent backup callers into one operation', async () => {
    let releaseBackup!: () => void;
    const backupGate = new Promise<void>((resolve) => {
      releaseBackup = resolve;
    });
    const operation = jest.fn(async () => {
      await backupGate;
      return { enabled: true, uploaded: true, message: 'uploaded' };
    });

    const first = runBackupSingleFlight(operation);
    const second = runBackupSingleFlight(operation);
    await Promise.resolve();

    expect(second).toBe(first);
    expect(operation).toHaveBeenCalledTimes(1);

    releaseBackup();
    await expect(first).resolves.toMatchObject({ uploaded: true });

    await runBackupSingleFlight(operation);
    expect(operation).toHaveBeenCalledTimes(2);
  });

  it('accepts only manifests with immutable paths and complete checksums', () => {
    const manifest = validManifest();
    expect(validateChunkedBackupManifest(manifest)).toEqual(manifest);

    expect(() =>
      validateChunkedBackupManifest({
        ...manifest,
        prefix: 'latest/chunks/',
      })
    ).toThrow('storage metadata');

    expect(() =>
      validateChunkedBackupManifest({
        ...manifest,
        chunkSha256: ['not-a-sha256'],
      })
    ).toThrow('checksums');
  });

  it('does not replace the existing database when the restore candidate is corrupt', async () => {
    const directory = createTestDirectory();
    const databasePath = path.join(directory, 'tcg-prices.db');
    const candidatePath = path.join(directory, 'candidate.db');
    const originalBytes = Buffer.from('prior-known-good-database');
    fs.writeFileSync(databasePath, originalBytes);
    fs.writeFileSync(candidatePath, 'not a sqlite database');

    await expect(replaceDatabaseWithVerifiedCandidate(candidatePath, databasePath)).rejects.toThrow(
      'integrity verification'
    );

    expect(fs.readFileSync(databasePath)).toEqual(originalBytes);
    expect(fs.existsSync(candidatePath)).toBe(true);
  });
});
