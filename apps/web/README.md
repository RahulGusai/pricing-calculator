# Web service

This directory is reserved for the React frontend. It intentionally contains no
application source or dependency manifest until a visual direction is approved.

Planned boundary: React 19 + TypeScript + Vite, React Router, TanStack Query, React
Hook Form, Zod, MSW, Vitest/Testing Library, Playwright, and Caddy on Railway.

The mock API must mirror the planned FastAPI contract and use deterministic fixtures;
it must not leak calculation logic into presentation components.
