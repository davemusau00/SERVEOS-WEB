# Authentication and authorization

Staff sign in through the PWA using their ServOS staff login and password. The API authenticates the account, issues a session and enrolls the browser as a device. The API returns the staff identity and effective permission set; the browser does not select an authority or role template.

API sessions and refresh tokens are revocable. Staff changes, device revocation and manager approvals use audited API commands. A staff member must have the required permission, and command handlers check authorization again on the server.

`contracts/permissions.json` lists canonical permissions and the narrower grants staff administrators may assign. `contracts/roles.json` defines role templates. `scripts/check-contracts.mjs` validates those contracts against the active API command registry.

Keep API signing keys and database credentials in the server secret manager. Browser build variables may contain public API origins and public verification keys only.
