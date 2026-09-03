# Granot Browser Extension

Browser extension for Granot CRM [Enrichment](../CONTEXT.md) (Form Lead and Call Lead), [Extension User](../CONTEXT.md) workspaces ([Owner](../CONTEXT.md), [Sales](../CONTEXT.md), [Customer Service](../CONTEXT.md), leftover [Employee](../CONTEXT.md)), and related client-side tools.

**Platform domain language:** [`../CONTEXT.md`](../CONTEXT.md)

**ADRs:** [`../docs/adr/`](../docs/adr/)

**Agent consumer rules:** [`../docs/agents/domain.md`](../docs/agents/domain.md)

Workspace map: [`.cursor/rules/granot-extension-architecture.mdc`](.cursor/rules/granot-extension-architecture.mdc). Role meanings stay in the root glossary.

Workspace id `tariff-adjustment` (sidebar **Tariff**) is visible to Owner, Customer Service, and leftover Employee. Sales sees Binding Estimate Fee only and does not call the Vantage server. Default Sales and leftover Employee workspace is Binding Estimate Fee. Default Customer Service workspace is Tariff Adjustment. Binding Estimate Fee still does not call Vantage.

**Tariff Adjustment** terms live in the root glossary. Official contract: [`../docs/tariff-adjustment/tariff-adjustment-specification.md`](../docs/tariff-adjustment/tariff-adjustment-specification.md). Shared vocabulary always defers to the root glossary.
