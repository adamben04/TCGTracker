// Runs before the test framework is installed and before any test file (and
// its imports) are evaluated. Backend product modules validate env vars via
// zod at import time (see src/config/env.ts) and call process.exit(1) on
// failure, which crashes the whole Jest worker. Individual test files that
// only import service/util modules (not env.ts directly) had no chance to
// set JWT_SECRET before that import-time validation ran. Setting safe test
// defaults here, before module graphs load, fixes that without touching
// production validation logic.
process.env.NODE_ENV = process.env.NODE_ENV || 'test';
if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32) {
  process.env.JWT_SECRET = 'jest-test-jwt-secret-at-least-32-characters-long';
}
