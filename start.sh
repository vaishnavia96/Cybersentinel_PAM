#!/bin/bash
# NMS Start Script — starts backend, frontend, and poller

cd "$(dirname "$0")"

echo "=== Stopping existing services ==="
pkill -9 -f "uvicorn.*3010" 2>/dev/null
pkill -9 -f "node.*vite" 2>/dev/null
pkill -9 -f "poller_worker.py" 2>/dev/null
sleep 2

# Fix postgres password if needed
sudo -u postgres psql -c "ALTER USER postgres PASSWORD 'postgres';" 2>/dev/null

echo "=== Starting Backend (port 3010) ==="
cd backend
source venv/bin/activate
uvicorn app.main:app --host 0.0.0.0 --port 3010 --reload > /tmp/nms_backend.log 2>&1 &
BACKEND_PID=$!

echo "=== Starting Frontend (port 3000) ==="
cd ../frontend
npm run dev > /tmp/nms_frontend.log 2>&1 &
FRONTEND_PID=$!

echo "=== Waiting for backend ==="
sleep 4

echo "=== Starting Poller ==="
cd ../backend
source venv/bin/activate
python poller_worker.py --interval 30 > /tmp/nms_poller.log 2>&1 &
POLLER_PID=$!

sleep 2

echo ""
echo "=============================="
echo "  NMS Services Started"
echo "=============================="
echo "  Backend:  http://localhost:3010  (PID: $BACKEND_PID)"
echo "  Frontend: http://localhost:3000  (PID: $FRONTEND_PID)"
echo "  Poller:   running every 30s     (PID: $POLLER_PID)"
echo ""
echo "  Logs:"
echo "    Backend:  tail -f /tmp/nms_backend.log"
echo "    Frontend: tail -f /tmp/nms_frontend.log"
echo "    Poller:   tail -f /tmp/nms_poller.log"
echo ""
echo "  Stop all:  pkill -f 'uvicorn.*3010'; pkill -f 'node.*vite'; pkill -f poller_worker"
echo "=============================="
