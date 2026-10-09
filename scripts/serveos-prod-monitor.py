#!/usr/bin/env python3
"""Run the local ServOS health check and send deduplicated SMTP alerts."""

from __future__ import annotations

import argparse
import json
import os
import shlex
import smtplib
import ssl
import subprocess
import sys
import time
from email.message import EmailMessage
from pathlib import Path

DEFAULT_HEALTHCHECK = "/usr/local/sbin/serveos-prod-healthcheck"
DEFAULT_STATE = "/var/lib/serveos-prod-monitor/state.json"
ALERT_COOLDOWN_SECONDS = 30 * 60


class AlertConfigurationError(RuntimeError):
    pass


def send_alert(event: str) -> None:
    host = os.environ.get("SERVEOS_ALERT_SMTP_HOST", "").strip()
    username = os.environ.get("SERVEOS_ALERT_SMTP_USERNAME", "")
    password = os.environ.get("SERVEOS_ALERT_SMTP_PASSWORD", "")
    sender = os.environ.get("SERVEOS_ALERT_FROM", "").strip()
    recipient = os.environ.get("SERVEOS_ALERT_TO", "kasina@davemusau.co.ke").strip()
    try:
        port = int(os.environ.get("SERVEOS_ALERT_SMTP_PORT", "587"))
    except ValueError as exc:
        raise AlertConfigurationError("SMTP port configuration is invalid") from exc
    if not host or not sender or "@" not in sender or "@" not in recipient:
        raise AlertConfigurationError("SMTP host, sender, and recipient must be configured")
    if (username and not password) or (password and not username):
        raise AlertConfigurationError("SMTP username and password must be configured together")
    if not 1 <= port <= 65535:
        raise AlertConfigurationError("SMTP port is outside the supported range")

    labels = {
        "test": "Test notification",
        "failure": "Health check failed",
        "recovery": "Health check recovered",
    }
    if event not in labels:
        raise AlertConfigurationError("Unsupported alert event")

    message = EmailMessage()
    message["From"] = sender
    message["To"] = recipient
    message["Subject"] = f"ServOS production alert: {labels[event]}"
    message.set_content(
        f"{labels[event]} at {time.strftime('%Y-%m-%d %H:%M:%S UTC', time.gmtime())}.\n\n"
        "The ServOS VPS health monitor detected this event. For a failure, inspect the local "
        "serveos-prod-healthcheck journal on the VPS. This message contains no business data or credentials.\n"
    )

    context = ssl.create_default_context()
    with smtplib.SMTP(host, port, timeout=10) as client:
        client.ehlo()
        client.starttls(context=context)
        client.ehlo()
        if username:
            client.login(username, password)
        client.send_message(message)


def load_state(path: Path) -> dict[str, object]:
    try:
        state = json.loads(path.read_text(encoding="utf-8"))
    except FileNotFoundError:
        return {}
    except (OSError, json.JSONDecodeError):
        print("ServOS monitor state is unreadable; treating status as unknown", file=sys.stderr)
        return {}
    return state if isinstance(state, dict) else {}


def save_state(path: Path, state: dict[str, object]) -> None:
    path.parent.mkdir(mode=0o700, parents=True, exist_ok=True)
    temporary = path.with_name(f".{path.name}.{os.getpid()}.tmp")
    descriptor = os.open(temporary, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    try:
        with os.fdopen(descriptor, "w", encoding="utf-8") as stream:
            json.dump(state, stream, separators=(",", ":"))
            stream.write("\n")
            stream.flush()
            os.fsync(stream.fileno())
        os.replace(temporary, path)
        os.chmod(path, 0o600)
    finally:
        try:
            temporary.unlink()
        except FileNotFoundError:
            pass


def notify(event: str) -> bool:
    try:
        send_alert(event)
        print(f"ServOS monitor email sent: {event}")
        return True
    except (AlertConfigurationError, OSError, smtplib.SMTPException) as exc:
        # Never print exception details from SMTP libraries; they can contain server data.
        print(f"ServOS monitor email unavailable: {type(exc).__name__}", file=sys.stderr)
        return False


def run_monitor() -> int:
    check_command = shlex.split(os.environ.get("SERVEOS_HEALTHCHECK_COMMAND", DEFAULT_HEALTHCHECK))
    state_path = Path(os.environ.get("SERVEOS_MONITOR_STATE", DEFAULT_STATE))
    previous = load_state(state_path)
    now = int(time.time())
    try:
        result = subprocess.run(check_command, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, timeout=40, check=False)
        healthy = result.returncode == 0
    except (OSError, subprocess.SubprocessError):
        healthy = False

    old_status = previous.get("status")
    last_attempt = previous.get("lastNotificationAttempt")
    if not healthy:
        due = old_status != "failed" or not isinstance(last_attempt, int) or now - last_attempt >= ALERT_COOLDOWN_SECONDS
        if due:
            notify("failure")
            last_attempt = now
        save_state(state_path, {"status": "failed", "lastNotificationAttempt": last_attempt})
        return 1

    if old_status == "failed":
        notify("recovery")
    save_state(state_path, {"status": "healthy", "lastNotificationAttempt": None})
    return 0


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--test-alert", action="store_true", help="Send one test email using the configured SMTP relay")
    args = parser.parse_args()
    if args.test_alert:
        return 0 if notify("test") else 1
    return run_monitor()


if __name__ == "__main__":
    raise SystemExit(main())
