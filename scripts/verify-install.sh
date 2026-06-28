#!/usr/bin/env bash
# verify-install.sh - End-to-end install verification for hiai-observe.
#
# Usage:
#   ./scripts/verify-install.sh
#
# Description:
#   Runs a series of independent checks to verify a fresh hiai-observe
#   installation. Each step reports PASS or FAIL. The script never aborts
#   on a single failure - it runs every step and summarizes at the end.
#   Exits 0 only if every step passes; otherwise exits 1.
#
# Steps verified:
#   1. Prerequisites: docker, curl, openssl installed
#   2. .env file exists (copies from .env.example if missing)
#   3. HIAI_OBSERVE_API_KEY is set in .env (generates with
#      `openssl rand -hex 24` if the current value is empty or matches
#      the .env.example placeholder)
#   4. `docker compose up -d` starts the stack
#   5. GET http://localhost:8001/health returns 200 with body containing
#      `{"status":"ok"}`
#   6. GET http://localhost:8001/api/health returns 200 with body
#      containing `{"status":"ok"}`
#
# Health-check polling: 120s total, retries every 5s.
# Stack bring-up timeout: 600s (covers cold image builds + pulls).
#
# This script never deletes data and never runs destructive commands.
# It only writes to .env when HIAI_OBSERVE_API_KEY is missing or unset,
# and only to the HIAI_OBSERVE_API_KEY line.

set -uo pipefail

# ── Constants ──────────────────────────────────────────────────────────────
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"

HEALTH_TIMEOUT_SEC=120
HEALTH_RETRY_INTERVAL_SEC=5
COMPOSE_TIMEOUT_SEC=600

HEALTH_HOST="http://localhost:8001"
EXPECTED_BODY='"status":"ok"'

COMPOSE_LOG="/tmp/verify-install-compose.log"
PLACEHOLDER_API_KEY="your-secret-api-key-here"

# ── State ──────────────────────────────────────────────────────────────────
TOTAL=0
PASSED=0
FAILED_STEPS=()

# ── Helpers ────────────────────────────────────────────────────────────────
log_info() { printf '[verify] %s\n' "$*"; }

log_step() { printf '\n=== %s ===\n' "$*"; }

record_step() {
  local name="$1"
  local rc="$2"
  TOTAL=$((TOTAL + 1))
  if [ "$rc" -eq 0 ]; then
    PASSED=$((PASSED + 1))
    printf 'PASS  %s\n' "$name"
  else
    FAILED_STEPS+=("$name")
    printf 'FAIL  %s\n' "$name"
  fi
}

# Returns 0 if a tool is found in PATH, 1 otherwise.
check_prereq() {
  local tool="$1"
  if command -v "$tool" >/dev/null 2>&1; then
    log_info "  found: $tool"
    return 0
  fi
  log_info "  missing: $tool (install it and re-run)"
  return 1
}

# Returns 0 if .env exists after the call (creates from .env.example if needed).
ensure_env() {
  if [ -f "${PROJECT_ROOT}/.env" ]; then
    log_info "  .env already present"
    return 0
  fi
  if [ ! -f "${PROJECT_ROOT}/.env.example" ]; then
    log_info "  .env.example not found in ${PROJECT_ROOT}"
    return 1
  fi
  log_info "  copying .env.example -> .env"
  cp "${PROJECT_ROOT}/.env.example" "${PROJECT_ROOT}/.env" || return 1
  return 0
}

# Returns 0 if HIAI_OBSERVE_API_KEY is set in .env after the call.
# Generates a new key with `openssl rand -hex 24` if the current value is
# empty or matches the .env.example placeholder. Leaves .env untouched
# when a non-placeholder value is already present.
ensure_api_key() {
  local env_file="${PROJECT_ROOT}/.env"
  local current new_key
  current=$(grep -E '^[[:space:]]*HIAI_OBSERVE_API_KEY[[:space:]]*=' "$env_file" 2>/dev/null \
    | head -n1 \
    | sed -E 's/^[[:space:]]*HIAI_OBSERVE_API_KEY[[:space:]]*=[[:space:]]*//' \
    | tr -d '"' \
    | tr -d "'")
  case "$current" in
    ""|"$PLACEHOLDER_API_KEY")
      log_info "  HIAI_OBSERVE_API_KEY is missing or placeholder"
      ;;
    *)
      log_info "  HIAI_OBSERVE_API_KEY already set (len=${#current})"
      return 0
      ;;
  esac
  new_key=$(openssl rand -hex 24) || return 1
  log_info "  generated HIAI_OBSERVE_API_KEY (len=${#new_key})"
  if grep -qE '^[[:space:]]*HIAI_OBSERVE_API_KEY[[:space:]]*=' "$env_file"; then
    if ! awk -v key="$new_key" '
        /^[[:space:]]*HIAI_OBSERVE_API_KEY[[:space:]]*=/ { print "HIAI_OBSERVE_API_KEY=" key; next }
        { print }
      ' "$env_file" > "${env_file}.tmp"; then
      rm -f "${env_file}.tmp"
      return 1
    fi
    mv "${env_file}.tmp" "$env_file" || return 1
  else
    printf '\nHIAI_OBSERVE_API_KEY=%s\n' "$new_key" >> "$env_file" || return 1
  fi
  return 0
}

# Polls a health endpoint. Args: url. Returns 0 if status==200 and body
# contains EXPECTED_BODY, 1 on timeout or persistent failure.
poll_health() {
  local url="$1"
  local deadline attempt raw status body
  deadline=$(( $(date +%s) + HEALTH_TIMEOUT_SEC ))
  attempt=0
  while [ "$(date +%s)" -lt "$deadline" ]; do
    attempt=$((attempt + 1))
    raw=$(curl -sS --max-time 5 -w $'\n%{http_code}' "$url" 2>/dev/null) || raw=""
    status=$(printf '%s\n' "$raw" | tail -n1)
    body=$(printf '%s\n' "$raw" | sed '$d')
    if [ "$status" = "200" ] \
      && [ -n "$body" ] \
      && printf '%s' "$body" | grep -q "$EXPECTED_BODY"; then
      log_info "  attempt ${attempt}: 200 OK"
      return 0
    fi
    sleep "$HEALTH_RETRY_INTERVAL_SEC"
  done
  log_info "  timed out after ${HEALTH_TIMEOUT_SEC}s (last status=${status:-n/a})"
  return 1
}

# ── Steps ──────────────────────────────────────────────────────────────────
log_step "Step 1/6: Prerequisites"
log_info "checking docker, curl, openssl"
prereq_rc=0
check_prereq docker  || prereq_rc=1
check_prereq curl    || prereq_rc=1
check_prereq openssl || prereq_rc=1
record_step "Prerequisites (docker, curl, openssl)" "$prereq_rc"

log_step "Step 2/6: .env file"
log_info "ensuring .env exists in ${PROJECT_ROOT}"
if ensure_env; then
  record_step ".env file present" 0
else
  record_step ".env file present" 1
fi

log_step "Step 3/6: HIAI_OBSERVE_API_KEY"
log_info "ensuring HIAI_OBSERVE_API_KEY is set in .env"
if ensure_api_key; then
  record_step "HIAI_OBSERVE_API_KEY is set in .env" 0
else
  record_step "HIAI_OBSERVE_API_KEY is set in .env" 1
fi

log_step "Step 4/6: docker compose up -d"
log_info "starting the stack (timeout ${COMPOSE_TIMEOUT_SEC}s)..."
compose_rc=1
if ( cd "${PROJECT_ROOT}" && timeout "${COMPOSE_TIMEOUT_SEC}" docker compose up -d >"${COMPOSE_LOG}" 2>&1 ); then
  log_info "  compose up succeeded"
  compose_rc=0
else
  log_info "  compose up failed (see ${COMPOSE_LOG}):"
  tail -n 20 "${COMPOSE_LOG}" 2>/dev/null | sed 's/^/    /'
fi
record_step "docker compose up -d" "$compose_rc"

log_step "Step 5/6: GET /health"
log_info "polling ${HEALTH_HOST}/health (timeout ${HEALTH_TIMEOUT_SEC}s, retry every ${HEALTH_RETRY_INTERVAL_SEC}s)"
if poll_health "${HEALTH_HOST}/health"; then
  record_step 'GET /health returns 200 + {"status":"ok"}' 0
else
  record_step 'GET /health returns 200 + {"status":"ok"}' 1
fi

log_step "Step 6/6: GET /api/health"
log_info "polling ${HEALTH_HOST}/api/health (timeout ${HEALTH_TIMEOUT_SEC}s, retry every ${HEALTH_RETRY_INTERVAL_SEC}s)"
if poll_health "${HEALTH_HOST}/api/health"; then
  record_step 'GET /api/health returns 200 + {"status":"ok"}' 0
else
  record_step 'GET /api/health returns 200 + {"status":"ok"}' 1
fi

# ── Summary ────────────────────────────────────────────────────────────────
printf '\n=== Summary ===\n'
echo "  ${PASSED}/${TOTAL} steps passed"
if [ "${#FAILED_STEPS[@]}" -gt 0 ]; then
  echo "FAILED steps:"
  for s in "${FAILED_STEPS[@]}"; do
    echo "  - $s"
  done
  exit 1
fi
echo "All checks passed."
exit 0
