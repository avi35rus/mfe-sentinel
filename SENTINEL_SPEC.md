## 1. Product Levels (Functional Scope)

### Preventative (CI/CD): CLI Audit Tool

The CLI must act as a gatekeeper, preventing broken contracts from reaching production.

*   **Parsing:** The tool analyzes `package.json` (to collect shared dependencies) and bundler plugins (Webpack Module Federation Plugin, Vite plugins). For Webpack, it reads the AST tree of the generated `remoteEntry.js` and extracts `exposes`, `remotes`, and `shared` objects.
*   **Manifest Generation:** The CLI generates a JSON snapshot (Manifest) describing what the module *provides*, what it *consumes*, and which singleton libraries it expects.
*   **Comparison Strategies (Semver):** Strict comparison of `peerDependencies` and `shared` is used. If a module expects `react@^18.0.0` but the host provides `17.0.2` (Major Version Mismatch), the CLI returns `exit code 1` and aborts the pipeline. Minor and Patch versions are logged as Warnings.

### Observability (Runtime): Browser Agent

The agent must be lightweight (< 5 KB gzipped) to avoid slowing down Time-To-Interactive (TTI).

*   **Error Interception:** The agent wraps `window.onerror` and global promise handlers, filtering typical Module Federation errors (e.g., `ScriptExternalLoadError` or `Shared module is not available for eager consumption`).
*   **Load Tracking:** Intercepts dynamic import events (`__webpack_require__.l` in Webpack), measuring the load time of remote chunks.
*   **Telemetry Dispatch:** Data is collected in batches and sent asynchronously to the Sentinel backend using `navigator.sendBeacon()`, ensuring delivery even when a tab is closed without blocking the main thread.

### Governance (Dashboard): Control Center

The control panel must provide full system transparency.

*   **Graph Visualization:** Using libraries like React Flow or D3.js to render a Force-directed graph. Nodes represent modules; edges represent dependencies. Color indication shows problematic nodes (red for conflict, yellow for outdated minor version).
*   **Remote Rollback:** Implemented via the "Dynamic Remotes" pattern. Client applications do not request the URL for `remoteEntry.js` from their own code, but through the Sentinel API/CDN (Dynamic Manifest Resolution). When "Rollback" is clicked in the dashboard, Sentinel instantly updates the JSON response on the CDN to point to the previous stable build hash of the module. No host rebuild is required.

---

## 2. Architectural Challenges

### Data Consistency (Snapshot Storage)

For fast incompatibility lookups, relational databases are not always efficient due to the high number of JOIN queries required when traversing the tree.

*   The optimal solution is a **Graph Database** (e.g., Neo4j or AWS Neptune).
*   Each application version becomes a node; `consumes` and `provides` relationships become edges.
*   When a new manifest is uploaded, the graph DB instantly calculates the shortest paths and identifies transitive dependency conflicts across the entire depth of the tree.

### Scalability

Enterprise clients generate thousands of deployments and millions of telemetry events per day.

*   **CI/CD API:** Scales horizontally behind a load balancer. Validation requests are written to an event queue (Apache Kafka or AWS SQS) for asynchronous processing by the dependency graph.
*   **Runtime Telemetry:** Processed through an Ingestion Pipeline (e.g., ClickHouse) optimized for writing massive volumes of Time-series data.
*   **Dynamic Manifests:** Distributed exclusively via Edge CDN (Cloudflare or AWS CloudFront) with edge caching. Rollback requests invalidate specific keys in the CDN within milliseconds.

### Security (Security and CORS)

*   **CORS:** The browser agent sends telemetry to the Sentinel API Gateway. The gateway is configured with `Access-Control-Allow-Origin: *` for the log collection endpoint, as the data is anonymized and contains no PII.
*   **On-premise (Enterprise):** The system is packaged into Kubernetes Helm Charts. All components (Graph DB, ClickHouse, API Gateways) are isolated within the client's VPC, ensuring that proprietary source code and infrastructure structure do not leave the company perimeter.

---

## 3. Technical Implementation of the Graph and Validation Algorithm

### Graph DB Structure (Logical Model)

| Entity Type        | Attributes                                  | Description                                |
| :----------------- | :------------------------------------------ | :----------------------------------------- |
| **Node: App**      | `id`, `name`, `repo_url`                    | Container for the micro-frontend.          |
| **Node: Version**  | `id`, `app_id`, `version_hash`, `timestamp` | A specific application build.              |
| **Edge: PROVIDES** | `module_name`, `file_path`                  | Link from Version to the exported module.  |
| **Edge: REQUIRES** | `package_name`, `semver_range`, `singleton` | Link from Version to a dependency.         |

### Contract Validation Algorithm (CI/CD)

1.  **Extract:** The CLI extracts the local manifest (Remotes, Exposes, Shared) from the new build of MFE "A".
2.  **Fetch State:** A request is sent to the Sentinel API to retrieve the current "Production" graph (all active versions of other MFEs).
3.  **Simulate Resolution:** Sentinel builds a virtual tree: what would happen if MFE "A" were injected into this graph.
4.  **Check Shared Deps:** Validation of all modules connected to "A". If "A" requires `react@18` (singleton: true) and the current Host provides `react@17`, the algorithm flags a `Major Conflict`.
5.  **Check Interfaces:** Verification that all methods/components imported by "A" (Remotes) are actually exported by the current versions of providers (Exposes).
6.  **Report:** Returns the list of conflicts to the CLI. If critical errors are present—status is Failed.

---

## 4. Commercialization Strategy & Roadmap

The monetization model is built on an **Open-Core** approach: basic functionality to attract developers is free, while advanced governance tools are sold to the Enterprise segment.

| Feature           | Open Source / Free Tier   | Pro / Enterprise (Paid)                                 |
| :---------------- | :------------------------ | :------------------------------------------------------ |
| **CI/CD Audit**   | Local check (CLI)         | Cross-project validation in the cloud                   |
| **Dashboard**     | Simple list of modules    | Visual 3D graph, RBAC, audit logs                       |
| **Observability** | Basic console errors      | Runtime log aggregation, alerting (Slack, PagerDuty)    |
| **Governance**    | Manual config changes     | One-click "Remote Rollback", A/B testing of modules     |
| **Hosting**       | Self-hosted (Core only)   | Managed Cloud, On-Premise distribution (Helm)           |

### Product Development Roadmap

*   **Phase 1: MVP & Community Adoption (Months 1-3)**
    *   Release Open Source CLI for Webpack Module Federation parsing.
    *   Free SaaS dashboard (limited to 5 applications).
    *   Goal: Integration into pet projects and small teams, feedback collection.
*   **Phase 2: Retention & Monetization - Pro Tier (Months 4-8)**
    *   Release Observability browser agent.
    *   Launch Pro subscription ($49-99/mo per team).
    *   Integration with Vite and Single-SPA.
    *   Goal: Reaching $10k MRR via mid-sized tech companies.
*   **Phase 3: Enterprise & Governance (Months 9-15)**
    *   Develop Remote Rollback and Dynamic Manifests functionality.
    *   Package On-Premise version for banks and corporations.
    *   Implement SSO/SAML, SLA contracts.
    *   Goal: Securing core Enterprise partnerships and achieving commercial sustainability.
*   **Phase 4: AI-Powered Semantic Analysis (Future R&D)**
    *   Initiate R&D for AI-driven predictive guarding.
    *   Goal: Full automation of contract resolution using Frontier AI models.

---

## 5. Future Architecture: AI Integration (Phase 4)

To achieve complete Enterprise Governance and eliminate manual intervention, Sentinel will integrate advanced AI analysis into the core engine:

*   **Semantic AST Validation:** While traditional SemVer handles basic singleton checks, we will utilize state-of-the-art, high-context LLMs to analyze Abstract Syntax Tree (AST) differences. This allows Sentinel to predict runtime collisions that do not trigger standard SemVer bumps.
*   **Automated Conflict Resolution:** The AI engine will be used to automatically generate intelligent `codemods` and migration scripts, seamlessly resolving version mismatches across decentralized micro-frontend teams without manual developer overhead.
