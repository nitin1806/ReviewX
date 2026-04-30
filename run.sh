#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_DIR="$ROOT_DIR/backend"
FRONTEND_DIR="$ROOT_DIR/frontend"

usage() {
  cat <<'EOF'
Usage:
  ./run.sh backend   Start the FastAPI backend on http://127.0.0.1:8000
  ./run.sh frontend  Start the Vite frontend on http://127.0.0.1:5173
  ./run.sh all       Start both services

Notes:
  - Backend expects backend/.env with GROQ_API_KEY or OPENAI_API_KEY
  - Install backend deps with: cd backend && pip install -r requirements.txt
  - Install frontend deps with: cd frontend && npm install
EOF
}

backend_python() {
  if [[ -x "$BACKEND_DIR/env/bin/python" ]]; then
    printf '%s\n' "$BACKEND_DIR/env/bin/python"
    return
  fi

  if command -v python3 >/dev/null 2>&1; then
    command -v python3
    return
  fi

  echo "Python 3 is required for the backend." >&2
  exit 1
}

run_backend() {
  local py_bin
  py_bin="$(backend_python)"

  if [[ ! -f "$BACKEND_DIR/.env" ]]; then
    echo "Missing backend/.env. Copy backend/.env.example to backend/.env and add your API key." >&2
    exit 1
  fi

  cd "$BACKEND_DIR"
  exec "$py_bin" -m uvicorn main:app --reload --host 127.0.0.1 --port 8000
}

run_frontend() {
  if [[ ! -d "$FRONTEND_DIR/node_modules" ]]; then
    echo "Missing frontend/node_modules. Run: cd frontend && npm install" >&2
    exit 1
  fi

  cd "$FRONTEND_DIR"
  exec npm run dev -- --host 127.0.0.1 --port 5173
}

run_all() {
  local py_bin
  py_bin="$(backend_python)"

  if [[ ! -f "$BACKEND_DIR/.env" ]]; then
    echo "Missing backend/.env. Copy backend/.env.example to backend/.env and add your API key." >&2
    exit 1
  fi

  if [[ ! -d "$FRONTEND_DIR/node_modules" ]]; then
    echo "Missing frontend/node_modules. Run: cd frontend && npm install" >&2
    exit 1
  fi

  cd "$BACKEND_DIR"
  "$py_bin" -m uvicorn main:app --reload --host 127.0.0.1 --port 8000 &
  local backend_pid=$!

  cleanup() {
    kill "$backend_pid" >/dev/null 2>&1 || true
  }
  trap cleanup EXIT INT TERM

  cd "$FRONTEND_DIR"
  npm run dev -- --host 127.0.0.1 --port 5173
}

case "${1:-}" in
  backend)
    run_backend
    ;;
  frontend)
    run_frontend
    ;;
  all)
    run_all
    ;;
  *)
    usage
    exit 1
    ;;
esac
