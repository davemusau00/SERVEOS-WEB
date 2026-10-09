import importlib.util
import os
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

MODULE_PATH = Path(__file__).resolve().parents[1] / "scripts" / "serveos-prod-monitor.py"
SPEC = importlib.util.spec_from_file_location("serveos_prod_monitor", MODULE_PATH)
monitor = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(monitor)


class FakeSMTP:
    instances = []

    def __init__(self, host, port, timeout):
        self.host, self.port, self.timeout = host, port, timeout
        self.sent = []
        self.__class__.instances.append(self)

    def __enter__(self):
        return self

    def __exit__(self, *args):
        return False

    def ehlo(self):
        pass

    def starttls(self, context):
        self.context = context

    def login(self, username, password):
        self.username = username

    def send_message(self, message):
        self.sent.append(message)


class MonitorTests(unittest.TestCase):
    def test_test_alert_uses_starttls_and_never_puts_credentials_in_message(self):
        environment = {
            "SERVEOS_ALERT_SMTP_HOST": "smtp.example.test",
            "SERVEOS_ALERT_SMTP_PORT": "587",
            "SERVEOS_ALERT_SMTP_USERNAME": "alerts@example.test",
            "SERVEOS_ALERT_SMTP_PASSWORD": "private-test-secret",
            "SERVEOS_ALERT_FROM": "alerts@example.test",
            "SERVEOS_ALERT_TO": "kasina@davemusau.co.ke",
        }
        FakeSMTP.instances.clear()
        with patch.dict(os.environ, environment, clear=False), patch.object(monitor.smtplib, "SMTP", FakeSMTP):
            monitor.send_alert("test")
        message = FakeSMTP.instances[-1].sent[0]
        self.assertEqual(message["To"], "kasina@davemusau.co.ke")
        self.assertIn("Test notification", message["Subject"])
        self.assertNotIn("private-test-secret", message.as_string())

    def test_missing_smtp_configuration_fails_closed(self):
        with patch.dict(os.environ, {}, clear=True):
            with self.assertRaises(monitor.AlertConfigurationError):
                monitor.send_alert("test")

    def test_failure_alert_is_deduplicated_and_recovery_notified(self):
        with tempfile.TemporaryDirectory() as directory:
            state = Path(directory) / "state.json"
            env = {"SERVEOS_MONITOR_STATE": str(state), "SERVEOS_HEALTHCHECK_COMMAND": "healthcheck"}
            with patch.dict(os.environ, env, clear=False), patch.object(monitor.subprocess, "run") as run, patch.object(monitor, "notify") as notify:
                run.return_value.returncode = 1
                self.assertEqual(monitor.run_monitor(), 1)
                self.assertEqual(monitor.run_monitor(), 1)
                notify.assert_called_once_with("failure")
                run.return_value.returncode = 0
                self.assertEqual(monitor.run_monitor(), 0)
                self.assertEqual(notify.call_count, 2)
                self.assertEqual(notify.call_args_list[-1].args, ("recovery",))


if __name__ == "__main__":
    unittest.main()
