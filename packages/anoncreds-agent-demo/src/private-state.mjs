import { chmodSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { DatabaseSync } from "node:sqlite";

const PRIVATE_FILE_MODE = 0o600;

/**
 * Open verifier state using owner-only permissions. A restrictive process
 * umask also protects SQLite's WAL/SHM files created after this call.
 */
export function openPrivateDatabase(filename) {
  if (typeof filename !== "string" || filename.length === 0) {
    throw new TypeError("A SQLite filename is required");
  }

  // The verifier is a dedicated process. Keep new database and sidecar files
  // private for the lifetime of the process, including on later WAL creation.
  process.umask(0o077);
  mkdirSync(dirname(filename), { recursive: true, mode: 0o700 });
  const database = new DatabaseSync(filename);

  try {
    for (const path of [filename, `${filename}-wal`, `${filename}-shm`]) {
      try {
        chmodSync(path, PRIVATE_FILE_MODE);
      } catch (error) {
        if (error.code !== "ENOENT") throw error;
      }
    }
  } catch (error) {
    database.close();
    throw error;
  }
  return database;
}
