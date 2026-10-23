# Operational access scopes

Administrator role and operational capabilities are intentionally separate.
An administrator may manage grants but does not receive ticket or asset access
unless the data action has an independently defined authorization rule. Current
operational permissions are loaded from active `AccessGrant` documents during
every authenticated request; sessions do not contain an authoritative grant
snapshot.

Organization-wide grants are stored with `department: null`. Department-scoped
grants store the department ObjectId. Recipient, capability, organization, and
scope are immutable; changing any of them requires revoking the historical
grant and creating a new one.

`src/modules/access/scopeFilters.js` provides:

- `hasOrganizationCapability()` and `hasDepartmentCapability()` for decisions;
- `requireCapability()` for route middleware;
- `buildCapabilityScopeFilter()` and `buildSupportScopeFilter()` for applying
  organization and department limits in the database query itself; and
- `ticketVisibilityPolicy()` to keep public ticket visibility separate from
  internal-note visibility.

Business modules must apply the returned scope filter before fetching,
counting, or serializing records. Assignment is a record relationship and must
not be ORed around the active support-scope filter. Likewise, a capability is
only one authorization input: ticket state, requester ownership, assignment,
and action-specific rules must still be evaluated by the future ticket module.

Grant creation and revocation write their audit record in the same MongoDB
transaction. A replica set is therefore required, using the same setup
documented in `AUTHENTICATION.md`.
