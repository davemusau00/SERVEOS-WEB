# Legacy Print Bridge source

The Print Bridge is not part of the ServOS V2 operator workflow. ServOS V2 prints through the browser/PWA and the workstation's operating-system print dialog. Do not install, pair, configure or depend on this legacy companion for receipts, kitchen tickets or reports.

Bridge source and CI checks remain in the repository for maintenance only. Their presence does not indicate product support, printer compatibility or physical print acceptance.

The bridge contains no product, inventory, payment, room or staff domain. Its local SQLite storage is for print job delivery and recovery. A `SENT_TO_SPOOLER` result means the transport accepted data; it does not prove that paper physically printed.

The Rust bridge and printer transport are checked on Linux and Windows CI. The Windows job also builds the Windows service host. Physical printer behavior still requires site hardware acceptance.
