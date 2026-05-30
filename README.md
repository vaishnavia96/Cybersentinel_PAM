# Network Management System (NMS) — V1

A self-hosted network monitoring platform with SNMP polling, device discovery, real-time dashboards, topology mapping, alerting, syslog collection, and SSH terminal access.

---

## Architecture

```
frontend/     React + Vite + Tailwind CSS (port 3000)
backend/      FastAPI + SQLAlchemy + asyncpg (port 3010)
              ├── app/                  FastAPI application
              │   ├── api/routes/       REST endpoints
              │   ├── models/           SQLAlchemy ORM models
              │   ├── schemas/          Pydantic schemas
              │   └── core/             config, database, security
              ├── discovery_worker.py   SNMP discovery engine
              └── poller_worker.py      SNMP polling daemon
database      PostgreSQL (nms_db)
cache         Redis (localhost:6379)
```

---

## Tech Stack

| Layer     | Technology                            |
|-----------|---------------------------------------|
| Frontend  | React 18, Vite, Tailwind CSS v4       |
| Backend   | FastAPI, SQLAlchemy 2.0, asyncpg      |
| Database  | PostgreSQL (nms_db)                   |
| Cache     | Redis                                 |
| SNMP      | aiosnmp (async), pysnmp               |
| SSH       | Paramiko / Netmiko (WebSocket proxy)  |
| Auth      | JWT (python-jose), bcrypt             |
| Crypto    | Fernet (credential encryption)        |

---

## Prerequisites

- Ubuntu / Debian Linux
- Python 3.12
- Node.js 18+
- PostgreSQL 14+
- Redis
- `python3-venv`, `libpq-dev`, `snmp`, `snmp-mibs-downloader`

---

## Setup

```bash
# 1. Clone / copy project to server
cd /root/Network-Management-System/V1

# 2. Create Python virtualenv
cd backend
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt

# 3. Create PostgreSQL database
sudo -u postgres psql -c "CREATE DATABASE nms_db;"
sudo -u postgres psql -c "ALTER USER postgres PASSWORD 'postgres';"

# 4. Create .env file (copy and edit)
cp .env.example .env   # edit SECRET_KEY and FERNET_KEY

# 5. Run Alembic migrations
alembic upgrade head

# 6. Install frontend dependencies
cd ../frontend
npm install

# 7. Start everything
cd ..
bash start.sh
```

---

## Running Services

```bash
# Start all services at once
bash start.sh

# Or start individually:

# Backend (from backend/ with venv active)
uvicorn app.main:app --host 0.0.0.0 --port 3010 --reload

# Poller daemon (from backend/ with venv active)
python poller_worker.py --interval 30

# Frontend (from frontend/)
npm run dev

# Logs
tail -f /tmp/nms_backend.log
tail -f /tmp/nms_frontend.log
tail -f /tmp/nms_poller.log

# Stop all
pkill -f 'uvicorn.*3010'; pkill -f 'node.*vite'; pkill -f poller_worker
```

---

## Configuration (`backend/.env`)

```env
DATABASE_URL=postgresql+asyncpg://postgres:postgres@localhost:5432/nms_db
SECRET_KEY=<generate a strong random string>
FERNET_KEY=<generate with: python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())">
REDIS_URL=redis://localhost:6379
POLL_INTERVAL_SECONDS=60
ACCESS_TOKEN_EXPIRE_MINUTES=480
```

---

## API

- Base URL: `http://<server>:3010`
- Docs: `http://<server>:3010/docs`
- All endpoints (except `/api/auth/login`) require Bearer JWT token

Key endpoints:
- `POST /api/auth/login` — get access token
- `GET  /api/devices` — list all devices
- `POST /api/devices/rescan` — re-fingerprint devices via SNMP
- `POST /api/discovery/scan` — discover new devices on a subnet
- `GET  /api/metrics/{device_id}` — fetch polled metrics
- `GET  /api/alerts` — active alerts
- `GET  /api/credentials` — SNMP / SSH credentials

---

## Database Schema (key tables)

| Table               | Purpose                                    |
|---------------------|--------------------------------------------|
| devices             | Inventory (IP, hostname, vendor, status)   |
| credentials         | SNMP community strings / SSH passwords     |
| device_credentials  | Many-to-many: devices ↔ credentials        |
| metrics             | Time-series SNMP poll results (JSONB)      |
| alert_rules         | Threshold-based alert definitions          |
| active_alerts       | Currently firing alerts                    |
| installed_software  | Software discovered via SNMP hrSWInstalled |
| config_metadata     | Device config backups (SSH-pulled)         |
| topology_links      | LLDP/CDP-derived links between devices     |
| syslogs             | Received syslog messages                   |
| users               | User accounts with role-based access       |

---

## Known Issues & Limitations

### Windows SNMP (Net-SNMP 5.5)
Net-SNMP 5.5 on Windows is compiled without the `host` module. This means:
- **Performance tab**: No CPU/RAM data (hrProcessorLoad, UCD-SNMP MIBs return nothing)
- **Storage tab**: No disk data (hrStorageTable returns 0 objects)
- **Processes tab**: No process list (hrSWRun returns 0 objects)
- **Software tab**: No installed software (hrSWInstalled returns 0 objects)
- **Interfaces tab**: Works correctly (IF-MIB is available)

**Fix**: Upgrade Net-SNMP to 5.9 on Windows (includes host module).  
After upgrading, add `includeAllDisks 10%` to snmpd.conf.

### Config / SSH tabs
Require SSH credentials configured and linked to the device. SNMP alone is not enough.

---

## Poller Metrics Collected

| Metric Name    | Source OID                        | Notes                     |
|----------------|-----------------------------------|---------------------------|
| uptime         | 1.3.6.1.2.1.1.3.0                | sysUpTime                 |
| cpu            | UCD / Cisco / hrProcessorLoad     | tries multiple OIDs       |
| mem_total_kb   | UCD-SNMP-MIB / hrStorage          | kilobytes                 |
| mem_free_kb    | UCD-SNMP-MIB / hrStorage          | kilobytes                 |
| if_in_bytes    | IF-MIB ifInOctets                 | per interface             |
| if_out_bytes   | IF-MIB ifOutOctets                | per interface             |
| if_err_in      | IF-MIB ifInErrors                 | per interface             |
| if_err_out     | IF-MIB ifOutErrors                | per interface             |
| if_oper_status | IF-MIB ifOperStatus               | 1=up, 2=down              |
| proc_cpu_time  | hrSWRunPerfCPU (if available)     | Windows: not available    |
| proc_mem_kb    | hrSWRunPerfMem (if available)     | Windows: not available    |
| disk_used_kb   | hrStorageUsed (if available)      | Windows: not available    |
| disk_total_kb  | hrStorageSize (if available)      | Windows: not available    |

---

## Frontend Pages

| Route                     | Page           |
|---------------------------|----------------|
| `/`                       | Dashboard      |
| `/inventory`              | Device list    |
| `/inventory/:id`          | Device detail  |
| `/discovery`              | Subnet scanner |
| `/topology`               | Network map    |
| `/alerts`                 | Alert rules    |
| `/credentials`            | Credentials    |
| `/logs`                   | Syslogs        |
