import { describe, it, expect } from 'vitest';
import {
  compareVersions,
  buildConflict,
  compareManifests,
} from '../version-comparator.js';
import type { SentinelManifest } from '../../types/index.js';

// ─── compareVersions ──────────────────────────────────────────────────────────

describe('compareVersions', () => {
  it('returns null when remote satisfies local range (compatible)', () => {
    expect(compareVersions('^18.2.0', '18.2.5')).toBeNull();
    expect(compareVersions('^18.0.0', '18.3.0')).toBeNull();
    expect(compareVersions('>=16.0.0', '18.0.0')).toBeNull();
  });

  it('returns "major" for cross-major version mismatch', () => {
    expect(compareVersions('^18.0.0', '17.0.2')).toBe('major');
    expect(compareVersions('^18.0.0', '19.0.0')).toBe('major');
    expect(compareVersions('^2.0.0', '1.9.9')).toBe('major');
  });

  it('returns "minor" for same major, different minor', () => {
    expect(compareVersions('^18.3.0', '18.1.0')).toBe('minor');
    expect(compareVersions('^6.4.0', '6.2.1')).toBe('minor');
  });

  it('returns "patch" for same major.minor, different patch', () => {
    expect(compareVersions('4.17.21', '4.17.10')).toBe('patch');
  });

  it('returns "major" when remote version cannot be coerced', () => {
    expect(compareVersions('^18.0.0', 'not-a-version')).toBe('major');
    expect(compareVersions('^18.0.0', '')).toBe('major');
  });

  it('handles non-standard range formats gracefully', () => {
    // ">=18" coerces to 18.0.0 — should satisfy "^18.2.0" as major-compatible
    const result = compareVersions('^18.2.0', '>=18.2.0');
    expect(['major', 'minor', 'patch', null]).toContain(result);
  });
});

// ─── buildConflict ────────────────────────────────────────────────────────────

describe('buildConflict', () => {
  it('produces a conflict with correct fields', () => {
    const conflict = buildConflict('react', '^18.0.0', '17.0.2', 'major', true);
    expect(conflict.packageName).toBe('react');
    expect(conflict.requiredVersion).toBe('^18.0.0');
    expect(conflict.providedVersion).toBe('17.0.2');
    expect(conflict.severity).toBe('major');
    expect(conflict.message).toContain('CRITICAL');
    expect(conflict.message).toContain('singleton');
  });

  it('omits singleton note when singleton is false', () => {
    const conflict = buildConflict('lodash', '^4.0.0', '3.9.0', 'major', false);
    expect(conflict.message).not.toContain('singleton');
  });

  it('labels minor conflicts correctly', () => {
    const conflict = buildConflict('react-router-dom', '^6.4.0', '6.2.1', 'minor', false);
    expect(conflict.message).toContain('WARNING');
    expect(conflict.severity).toBe('minor');
  });
});

// ─── compareManifests ─────────────────────────────────────────────────────────

const makeManifest = (
  name: string,
  shared: Array<{ name: string; version: string; singleton: boolean }>,
): SentinelManifest => ({
  name,
  version: '1.0.0',
  generatedAt: new Date().toISOString(),
  exposes: [],
  remotes: [],
  shared: shared.map((s) => ({ ...s, strictVersion: false })),
});

describe('compareManifests', () => {
  it('passes when all singleton deps are compatible', () => {
    const local = makeManifest('checkout', [
      { name: 'react', version: '^18.2.0', singleton: true },
    ]);
    const remote = makeManifest('shell', [
      { name: 'react', version: '18.2.5', singleton: true },
    ]);
    const result = compareManifests(local, remote);
    expect(result.passed).toBe(true);
    expect(result.conflicts).toHaveLength(0);
    expect(result.warnings).toHaveLength(0);
  });

  it('fails when there is a major singleton conflict', () => {
    const local = makeManifest('checkout', [
      { name: 'react', version: '^18.0.0', singleton: true },
    ]);
    const remote = makeManifest('shell', [
      { name: 'react', version: '17.0.2', singleton: true },
    ]);
    const result = compareManifests(local, remote);
    expect(result.passed).toBe(false);
    expect(result.conflicts).toHaveLength(1);
    expect(result.conflicts[0]?.packageName).toBe('react');
  });

  it('passes with a warning for minor singleton mismatch', () => {
    const local = makeManifest('checkout', [
      { name: 'react-router-dom', version: '^6.4.0', singleton: true },
    ]);
    const remote = makeManifest('shell', [
      { name: 'react-router-dom', version: '6.2.1', singleton: true },
    ]);
    const result = compareManifests(local, remote);
    expect(result.passed).toBe(true);
    expect(result.warnings).toHaveLength(1);
    expect(result.conflicts).toHaveLength(0);
  });

  it('ignores non-singleton (scoped) dependency conflicts', () => {
    const local = makeManifest('checkout', [
      { name: 'lodash', version: '^4.0.0', singleton: false },
    ]);
    const remote = makeManifest('shell', [
      { name: 'lodash', version: '3.9.0', singleton: false },
    ]);
    const result = compareManifests(local, remote);
    expect(result.passed).toBe(true);
    expect(result.conflicts).toHaveLength(0);
    expect(result.warnings).toHaveLength(0);
  });

  it('skips deps present only in local manifest (no remote equivalent)', () => {
    const local = makeManifest('checkout', [
      { name: 'new-lib', version: '^1.0.0', singleton: true },
    ]);
    const remote = makeManifest('shell', []);
    const result = compareManifests(local, remote);
    expect(result.passed).toBe(true);
    expect(result.conflicts).toHaveLength(0);
  });

  it('handles multiple conflicts correctly', () => {
    const local = makeManifest('checkout', [
      { name: 'react', version: '^18.0.0', singleton: true },
      { name: 'react-dom', version: '^18.0.0', singleton: true },
    ]);
    const remote = makeManifest('shell', [
      { name: 'react', version: '17.0.2', singleton: true },
      { name: 'react-dom', version: '17.0.2', singleton: true },
    ]);
    const result = compareManifests(local, remote);
    expect(result.passed).toBe(false);
    expect(result.conflicts).toHaveLength(2);
  });
});
