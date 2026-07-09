# EVIDA Developer Directive: High-End Legal Command Center

This is EVIDA's North Star. Every future change to the product, UI, backend, security model, document pipeline, or AI workflow must be evaluated against this directive.

## 1. Role And Product Standard

You act as lead developer and architect for EVIDA, a legal command center.

EVIDA must maintain a production-grade standard. It must not feel like a generic SaaS tool. It must feel like an exclusive, authoritative workstation for professional legal practitioners.

## 2. Design Philosophy: Legal Dark Shell And Editorial Authority

- Use the Legal Dark Shell token system.
- Backgrounds should carry subtle grain texture for tactility and depth.
- Primary surfaces should use Liquid Glass with transparent dark layers, subtle rim light, deep weighted shadows, and restrained borders. Utility glass should stay light enough for the holographic background to remain visible; heavier blur is reserved for modals and critical focus states.
- Typography must convey authority and precision.
- Use Instrument Serif, or an equivalent high-contrast serif, for headings.
- Use Plus Jakarta Sans, or an equivalent geometric sans, for UI text.
- Layouts should be borderless high-end: avoid unnecessary grids, generic cards, cramped popups, and centered empty states.
- Prefer editorial layouts: left-aligned hierarchy, deliberate negative space, and calm focus.
- Modals must use the shared master modal standard, with wide landscape composition rather than narrow vertical boxes.
- AppShell is fixed as an elastic four-layer command center: 80px TopBar, 240px Sidebar, `minmax(700px, 1fr)` main work area with full-width content and 4rem editorial padding, and 320px right ControlPanel.
- The primary accent token is `--primary: #00d4a3`; use it as glow and status focus, not as broad saturated surface color.
- AppShell owns the global holographic background through `/background-clean.jpg`, a clean abstract image without Lady Justice, scales, or symbolic figures. It may use full-cover sizing because the active background contains only minimalist holographic linework; keep a radial fade and `screen` blend so the content remains the focal point.
- Dashboard and command surfaces should avoid heavy boxed backgrounds. Prefer transparent containers and 2-6% glass cards so the background reads as an architectural layer under the whole system.

## 3. Workflow: Guided Juridical Workspace

The intended workflow is linear and source-controlled:

```text
Sak -> Import -> Karantene -> Verifisering -> Saksrom -> Analyse -> Utkast
```

- The start surface is a Command Portal, not a noisy dashboard or an error-like empty state.
- The product should guide the lawyer to the next best action.
- Chat and reasoning surfaces must keep their input sticky at the bottom, so the lawyer always has the reasoning engine available. The main work area owns a minimal global EPIC Court Engine chatbar: one command input, a `+` trigger for mode/context choices, and small mic/send actions; room-specific assistants may keep richer sticky inputs and source controls.
- Saksrom is a split-screen legal workspace: roughly 60 percent source view and 40 percent reasoning engine.
- The reasoning engine must support the modes `Spørre`, `Argumentere`, and `Simulere`.
- Missing OCR or incomplete source coverage may create preliminary warnings, but must not be treated as the same thing as room unreadiness when usable sources exist.

## 4. Backend And Security Architecture

- All relevant web/backend communication must carry `X-Evida-Tenant-ID`.
- Backend must reject requests where the tenant header does not match the authenticated user.
- Backend is the authority for users, roles, tenant isolation, policy, audit, and provider routing.
- Documents start in `QUARANTINE`.
- Documents can only reach `VERIFIED` after successful parsing, OCR/source-unit indexing, and fail-closed validation through the ingestion pipeline.
- Large documents must not be loaded whole into memory.
- Use page-based `SourceUnit` records with stable IDs such as `doc_001_p450`.
- Source units must support lazy retrieval, RAG retrieval, citation jumps, and audit/provenance.

## 5. Development Standard

- EVIDA Web is an isolated React/Vite/TypeScript app.
- Do not reintroduce Tauri, Rust IPC, local SQLite, or desktop-only assumptions into `apps/web`.
- AI answers and room-level source pills must be source-bound. The global Command Portal chatbar should stay visually minimal until a room context is active, with secondary choices hidden behind the `+` trigger.
- Use `CitationManager` and `jump-to-source` events to connect AI citations to the document viewer.
- Code must be modular, testable, and covered by focused Vitest tests for frontend behavior.
- Document upload, ingestion, OCR, parsing, source objects, indexing, AI retrieval, export, and deletion are P0 safety surfaces.
- Preserve quarantine-first behavior.
- Prefer small, verifiable changes with clear status bundle updates.

## 6. Definition Of Done For Future Work

A change is not done unless:

- The behavior matches this directive.
- Relevant automated tests pass.
- Manual smoke evidence is documented when needed.
- Source-bound, tenant-safe, fail-closed behavior is preserved.
- The status bundle or readiness artifact is updated when scope changes.
- Remaining risk is stated clearly.

This directive is binding for EVIDA development.
