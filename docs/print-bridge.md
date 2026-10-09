# Print Bridge

The optional Print Bridge is the only local native companion. It receives an authorized print job, validates the API claim and rendered document, sends ESC/POS or configured network output, and records the transport result. The browser communicates with the local bridge and keeps business authorization with the API.

The bridge contains no product, inventory, payment, room or staff domain. Its local SQLite storage is for print job delivery and recovery. A `SENT_TO_SPOOLER` result means the transport accepted data; it does not prove that paper physically printed.

The Rust bridge and printer transport are checked on Linux and Windows CI. The Windows job also builds the Windows service host. Physical printer behavior still requires site hardware acceptance.
