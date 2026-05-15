# Sentinel — Micro-Frontend Contract Guard

[![CI](https://github.com/avi35rus/mfe-sentinel/actions/workflows/ci.yml/badge.svg)](https://github.com/avi35rus/mfe-sentinel/actions/workflows/ci.yml)
[![npm version](https://img.shields.io/npm/v/mfe-sentinel.svg)](https://www.npmjs.com/package/mfe-sentinel)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Node.js](https://img.shields.io/badge/Node.js-%3E%3D20-brightgreen)](https://nodejs.org)
[![TypeScript](https://img.shields.io/badge/TypeScript-strict-blue)](https://www.typescriptlang.org)

**Sentinel** prevents runtime crashes in distributed Micro-Frontend architectures by validating Webpack Module Federation contracts *before* they reach production.

> Website: [sentinel-hq.io](https://sentinel-hq.io) · Contact: [founder@sentinel-hq.io](mailto:founder@sentinel-hq.io)

---

## The Problem

In Module Federation, multiple MFEs share singleton libraries (React, React-DOM, etc.) at runtime. When one team upgrades React from 17 → 18 and another team doesn't, the app silently breaks — **no build error, no type error, just a runtime crash**.

Standard CI pipelines have no way to catch this. Sentinel does.

---

## Installation

The CLI is published on npm as **[mfe-sentinel](https://www.npmjs.com/package/mfe-sentinel)**.

```bash
# Run without installing (recommended for CI)
npx mfe-sentinel --help

# Global install
npm install -g mfe-sentinel

# Project devDependency
npm install -D mfe-sentinel
```

The package exposes two equivalent binaries: **`mfe-sentinel`** (canonical) and **`sentinel`** (short alias). Examples below use `mfe-sentinel`.

**Requirements:** Node.js ≥ 20.

---

## Quick Start

```bash
# 1. Initialize Sentinel in your MFE project
npx mfe-sentinel init

# 2. Scan your app and generate a manifest
npx mfe-sentinel scan \
  --mf-config ./module-federation.config.js \
  --output manifest.sentinel.json

# 3. Validate against the production manifest
npx mfe-sentinel check \
  --manifest manifest.sentinel.json \
  --remote remote-manifest.json
```

---

## CLI Commands

### `mfe-sentinel init`

Creates `sentinel.config.json` with sensible defaults in the current directory.

```
Options:
  --force   Overwrite existing config
```

### `mfe-sentinel scan`

Parses `module-federation.config.js` + `package.json` and generates a typed **SentinelManifest** JSON.

```
Options:
  -p, --package <path>    Path to package.json         (default: ./package.json)
  -m, --mf-config <path>  Path to module-federation.config.js (enables real parsing)
  -o, --output <path>     Output path for manifest     (default: ./manifest.sentinel.json)
  --no-save               Print to terminal only, do not write file
```

### `mfe-sentinel check`

Compares a local manifest against a production/remote manifest using SemVer-aware validation.

```
Options:
  -m, --manifest <path>   Local manifest path          (default: ./manifest.sentinel.json)
  -r, --remote <path>     Remote manifest path         (default: ./remote-manifest.json)
  --fail-on-warning       Exit code 1 on Minor conflicts too (strict mode)
```

**Exit codes:**
- `0` — All singleton dependencies are compatible. Deploy can proceed.
- `1` — Critical Major version conflict detected. Pipeline blocked.

---

## CI/CD Integration (GitHub Actions)

```yaml
- name: Sentinel contract check
  run: |
    npx mfe-sentinel scan --mf-config ./module-federation.config.js
    npx mfe-sentinel check --manifest manifest.sentinel.json --remote remote-manifest.json
```

When `react@17` (production) meets `react@^18` (new build), Sentinel returns `exit code 1` and blocks the deployment:

```
┌─ sentinel check ─────────────────────────────────
│  local → checkout@2.4.1   remote → shell@1.0.0
│
│  ✖ CRITICAL  (1)
│    ✖ react  requires ^18.2.0  ·  provided 17.0.2
│      [CRITICAL · Major Version Mismatch] "react": local requires "^18.2.0",
│      remote provides "17.0.2" [singleton — runtime conflict guaranteed]
│
│  ✖ FAILED  (pipeline blocked — fix Major conflicts before deploying)
└──────────────────────────────────────────────────
```

---

## Validation Algorithm

The `mfe-sentinel check` engine implements the contract validation from [SENTINEL_SPEC.md](SENTINEL_SPEC.md):

1. **Extract** — Parse local manifest (Remotes, Exposes, Shared).
2. **Fetch State** — Load the production graph manifest.
3. **Check Shared Deps** — For every `singleton: true` dependency, compare SemVer ranges:
   - `semver.satisfies(remote, localRange)` → ✅ compatible
   - Major differs → ❌ `CRITICAL` conflict → `exit code 1`
   - Minor differs → ⚠ `WARNING` → logged, deploy proceeds
   - Patch differs → ℹ `INFO` → logged
4. **Report** — Structured output + exit code.

Non-singleton (`singleton: false`) dependencies are ignored — each MFE can have its own copy without runtime conflict.

---

## SentinelManifest Schema

```typescript
interface SentinelManifest {
  name: string;               // MFE application name
  version: string;            // Build version or git hash
  generatedAt: string;        // ISO 8601 timestamp
  exposes: ExposedModule[];   // Modules this MFE provides
  remotes: RemoteApp[];       // Modules this MFE consumes
  shared: SharedDependency[]; // Singleton libs and their SemVer ranges
}
```

---

## Architecture

```
CI/CD Pipeline
    │
    ├─► mfe-sentinel scan  →  manifest.sentinel.json
    │
    └─► mfe-sentinel check →  PASS (deploy) | WARN (log) | FAIL → exit 1
              ▲
              │  Sentinel API (production graph — planned)
              │
    ┌─────────┴─────────────────────────────────────
    │  Sentinel Backend (Planned)                  
    │                                              
    │  API Gateway                                 
    │    ├─► Kafka/SQS        (async queue)        
    │    ├─► Neo4j Graph DB   (dependency graph)   
    │    └─► ClickHouse       (runtime telemetry)  
    │                                              
    │  Dashboard  ◄─  React Flow / D3 graph        
    │  CDN Edge   ◄─  Dynamic Manifest + Rollback  
    └───────────────────────────────────────────────
```

Full technical specification including Graph DB schema, scalability design, and AI integration roadmap: **[SENTINEL_SPEC.md](SENTINEL_SPEC.md)**

---

## Project Structure

```
src/
├── index.ts                     # CLI entry point (commander)
├── types/
│   └── index.ts                 # TypeScript interfaces (SentinelManifest, etc.)
├── core/
│   ├── version-comparator.ts    # SemVer validation engine
│   └── __tests__/
│       └── version-comparator.test.ts
├── parsers/
│   └── webpack.parser.ts        # MF config + package.json parser
└── commands/
    ├── init.command.ts          # mfe-sentinel init
    ├── scan.command.ts          # mfe-sentinel scan
    └── check.command.ts         # mfe-sentinel check
```

---

## Development (from source)

```bash
git clone https://github.com/avi35rus/mfe-sentinel.git
cd mfe-sentinel
npm install
npm test
npm run build
node dist/index.js --help
```

---

## Tech Stack

| Layer | Technology |
|---|---|
| CLI | TypeScript · Node.js · Commander |
| Validation | semver · picocolors |
| Testing | Vitest |
| Backend (planned) | Node.js · ClickHouse · Neo4j |
| Infrastructure | Cloud-agnostic · AWS / GCP / Azure |
| Enterprise | Kubernetes Helm Charts · On-Premise |

---

## Roadmap

| Phase | Timeline | Goal |
|---|---|---|
| **Phase 1 — MVP** | Months 1–3 | ✅ Open Source CLI on npm (`mfe-sentinel`). Webpack MF support. Free SaaS dashboard (≤5 apps). |
| **Phase 2 — Pro** | Months 4–8 | Runtime browser agent. Pro subscription ($49–99/team/mo). Vite support. |
| **Phase 3 — Enterprise** | Months 9–15 | Remote Rollback, On-Premise (Helm), SSO/SAML, SLA contracts. |
| **Phase 4 — AI** | R&D | LLM-driven AST diff analysis. Automated codemod generation. |

---

## Contributing

Issues and PRs are welcome. See [SENTINEL_SPEC.md](SENTINEL_SPEC.md) for the full technical specification before contributing.

---

## License

[MIT](LICENSE) © 2026 Sentinel HQ
