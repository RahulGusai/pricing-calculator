# Architecture decision records

ADRs record choices that are cross-cutting or expensive to reverse.

| ADR | Status | Decision |
| --- | --- | --- |
| [0001](0001-isolated-cross-language-monorepo.md) | Accepted | Isolated web/API roots in one repository |
| [0002](0002-react-vite-mock-first.md) | Accepted | React/Vite frontend developed against contract mocks |
| [0003](0003-relational-state-s3-artifacts.md) | Accepted | Relational canonical state and private S3 artifacts |

Use `Context`, `Decision`, `Alternatives`, `Consequences`, and `Revisit triggers` in
new records. Accepted ADRs are superseded, not silently rewritten, once implementation
depends on them.
