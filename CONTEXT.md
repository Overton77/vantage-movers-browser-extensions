# Granot Browser Extension

Browser extension for Granot CRM [Enrichment](../CONTEXT.md) (Form Lead and Call Lead), [Extension User](../CONTEXT.md) workspaces ([Owner](../CONTEXT.md), [Sales](../CONTEXT.md), [Customer Service](../CONTEXT.md); leftover [Employee](../CONTEXT.md) migrates to Sales plus Customer Service), and related client-side tools.

**Platform domain language:** [`../CONTEXT.md`](../CONTEXT.md)

**ADRs:** [`../docs/adr/`](../docs/adr/)

**Agent consumer rules:** [`../docs/agents/domain.md`](../docs/agents/domain.md)

Workspace map: [`.cursor/rules/granot-extension-architecture.mdc`](.cursor/rules/granot-extension-architecture.mdc). Role meanings stay in the root glossary.

Workspace id `tariff-adjustment` (sidebar **Tariff**) is visible when the Extension User holds Owner or Customer Service. Sales sees Binding Estimate Fee only and does not call the Vantage server. Sales and Customer Service may be held together (that pair is also how leftover Employee is migrated). Default workspace: Owner → Form Leads; else Sales → Binding Estimate Fee; else Tariff Adjustment. Binding Estimate Fee still does not call Vantage.

**Extension User management (planned pack, not shipped):** EUM-01–04. Stored field becomes `roles[]`. Owner edit/delete and session invalidation live in [`docs/extension-user-management/README.md`](docs/extension-user-management/README.md). Role meanings stay in the root glossary.

**Tariff Adjustment** terms live in the root glossary. Official contract: [`../docs/tariff-adjustment/tariff-adjustment-specification.md`](../docs/tariff-adjustment/tariff-adjustment-specification.md). Shared vocabulary always defers to the root glossary.
