# Intake, enrollment and business setup

The installed application follows this durable state machine:

`NEW → INTAKE_IN_PROGRESS → READY_FOR_ENROLLMENT → ENROLLMENT_PENDING → SETUP_REQUIRED → READY_FOR_GO_LIVE → LIVE`

`runtime_status` returns the current state before login. After login, `runtime_snapshot` returns the same installation stage with the authenticated actor and permissions.

## Intake Wizard

The pre-enrollment Intake Wizard persists configuration intent in SQLite metadata through `runtime_intake_save` / `runtime_intake_complete`. It captures venue type, counter/tab/table service, operating pattern, payments, M-Pesa account, sales/stock model, service areas, stock areas, staff estimates, hardware expectations, import strategy and intended go-live date. No fake catalog or transaction records are created.

## Owner enrollment

Enrollment requires the confirmed intake, owner online authentication and a local 6–12 digit PIN. The backend creates the terminal identity, business/property shell, first Admin identity/employee and `businessSetup` progress record. It intentionally does **not** seed a restaurant outlet, stock store, products or opening balances.

## Business Setup Wizard

Required steps are:
1. Business identity
2. Tax configuration
3. Payment methods
4. Service areas
5. Stock locations
6. Catalog
7. Opening inventory acknowledgement
8. Staff access
9. Till policy

Optional steps are recipes/portions, floorplan and backup/synchronization rehearsal. Each `setup.completeStep` checks relevant persisted evidence rather than trusting UI checkbox state.

Opening stock uses `inventory.openingBalance` and creates explicit stock movements. It never rewrites stock silently.

## Go Live

`setup.goLive` is Admin-only and revalidates the required persisted business state. Once successful it writes approval actor/time into `businessSetup` and sets installation stage `LIVE`.

The Rust command boundary blocks till, order, payment, reconciliation, operational inventory and close-day commands until the stage is `LIVE`. UI gating is therefore not the only protection.


## Initial System Administrator from Intake

The confirmed Intake carries business identity, owner identity and the intended first System Administrator. Intake never stores online passwords or local PINs.

Enrollment authenticates the owner online, then the native backend rereads the confirmed Intake from SQLite and creates the initial local `Admin` from that profile. The PIN is validated and Argon2-hashed only during enrollment.

Owner and initial Administrator may be different people. Commissioning evidence is stored as `installationProfile/initial`.


### Reopen Intake before enrollment

A saved or previously confirmed Intake may be reopened before terminal enrollment. Reopening moves the installation back to `INTAKE_IN_PROGRESS` without deleting the saved non-secret profile. Intake remains immutable after enrollment.

### First-Go-Live backup gate

`BACKUP_SYNC` is a required setup step. The native backend refuses completion of that step and refuses Go Live until at least one successful consistent SQLite backup has been created on the enrolled terminal.

Service areas may exist without a default stock location while setup is still in progress because stock locations are configured in the following step. Go Live revalidates every active service area and requires a valid default stock location.
