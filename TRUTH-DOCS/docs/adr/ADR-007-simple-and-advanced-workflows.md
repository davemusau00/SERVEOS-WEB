# ADR-007 — Simple Default, Advanced Available

**Status:** Accepted product principle

## Decision

ServOS keeps advanced domain capability but default workflows expose the minimum business steps.

Examples:

- quick hotel check-in without customer account/deposit;
- menu item without recipe;
- PO item without accounting classification;
- stock entry in physical packaging.

## Reason

Advanced capability had become mandatory ceremony and made a capable system feel immature.

## Consequences

- progressive disclosure is required;
- advanced workflows remain tested;
- UI labels use business language while backend retains detailed domain models.
