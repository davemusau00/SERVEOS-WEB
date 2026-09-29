#!/usr/bin/env bash
set -euo pipefail

mode="Package"
skip_tests=0
msi=0

usage() {
  cat <<'USAGE'
Usage: bash scripts/deploy-windows-pos.sh [--check|--package|--install] [--skip-tests] [--msi]

  --check       Check Windows build prerequisites and XP-80 printer queue visibility.
  --package     Run checks, tests, and build the NSIS setup executable (default).
  --install     Build the setup executable, then offer to run it.
  --skip-tests  Skip frontend/browser/Rust checks for packaging iteration only.
  --msi         Build an MSI instead of NSIS; Windows VBSCRIPT must be enabled.
USAGE
}

while (($#)); do
  case "$1" in
    --check) mode="Check" ;;
    --package) mode="Package" ;;
    --install) mode="Install" ;;
    --skip-tests) skip_tests=1 ;;
    --msi) msi=1 ;;
    -h|--help) usage; exit 0 ;;
    *) echo "Unknown option: $1" >&2; usage >&2; exit 2 ;;
  esac
  shift
done

case "$(uname -s)" in
  MINGW*|MSYS*|CYGWIN*) ;;
  *) echo "Run this script from Git Bash on Windows." >&2; exit 1 ;;
esac

command -v cygpath >/dev/null 2>&1 || { echo "cygpath is missing; install/reinstall Git for Windows." >&2; exit 1; }
powershell_path="$(command -v powershell.exe || true)"
if [[ -z "$powershell_path" ]]; then
  echo "Windows PowerShell was not found on PATH. Reopen Git Bash after completing the Windows bootstrap." >&2
  exit 1
fi

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd -P)"
repo_windows="$(cygpath -aw "$repo_root")"
script_windows="$(cygpath -aw "$repo_root/scripts/deploy-windows.ps1")"

args=(-NoLogo -NoProfile -ExecutionPolicy Bypass -File "$script_windows" -Repo "$repo_windows" -Mode "$mode")
if ((skip_tests)); then args+=(-SkipTests); fi
if ((msi)); then args+=(-Msi); fi

"$powershell_path" "${args[@]}"
