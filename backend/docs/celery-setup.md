# Celery Task Queue Setup

## Overview

Celery is used for asynchronous background job processing, primarily for AI-powered step labeling. This allows workflows to be created quickly while AI processing happens in the background.

## Architecture

```
┌─────────────┐     ┌─────────┐     ┌──────────────┐
│   FastAPI   │────▶│  Redis  │◀────│Celery Worker │
│   (API)     │     │(Broker) │     │ (AI Tasks)   │
└─────────────┘     └─────────┘     └──────────────┘
       │                                     │
       └──────────── Database ──────────────┘
```

**Components:**
- **FastAPI**: Queues tasks after workflow creation
- **Redis**: Message broker and result backend
- **Celery Worker**: Processes AI labeling tasks
- **Database**: Shared state (workflows, steps)

## Prerequisites

### 1. Install Redis

**macOS (Homebrew):**
```bash
brew install redis
brew services start redis
```

**Linux (Ubuntu/Debian):**
```bash
sudo apt-get install redis-server
sudo systemctl start redis
sudo systemctl enable redis
```

**Verify Redis is running:**
```bash
redis-cli ping
# Should return: PONG
```

### 2. Environment Configuration

Ensure `.env` file contains:
```bash
# Redis (Celery)
REDIS_URL=redis://localhost:6379/0

# AI Services
ANTHROPIC_API_KEY=your-anthropic-api-key
```

## Running Celery Worker

### Development (Single Worker)

**Terminal 1 - Start FastAPI:**
```bash
cd backend
source venv/bin/activate
uvicorn app.main:app --reload --port 8000
```

**Terminal 2 - Start Celery Worker:**
```bash
cd backend
source venv/bin/activate
celery -A app.celery_app worker --loglevel=info
```

**Terminal 3 - (Optional) Monitor with Flower:**
```bash
cd backend
source venv/bin/activate
celery -A app.celery_app flower --port=5555
# Open http://localhost:5555 for monitoring UI
```

### Production

**Using systemd (Linux):**

Create `/etc/systemd/system/celery-worker.service`:
```ini
[Unit]
Description=Celery Worker for Workflow Platform
After=network.target redis.service

[Service]
Type=forking
User=www-data
Group=www-data
WorkingDirectory=/var/www/workflow-platform/backend
Environment="PATH=/var/www/workflow-platform/backend/venv/bin"
ExecStart=/var/www/workflow-platform/backend/venv/bin/celery -A app.celery_app worker \
          --loglevel=info \
          --concurrency=5 \
          --pidfile=/var/run/celery/worker.pid \
          --logfile=/var/log/celery/worker.log
Restart=always

[Install]
WantedBy=multi-user.target
```

Enable and start:
```bash
sudo systemctl daemon-reload
sudo systemctl enable celery-worker
sudo systemctl start celery-worker
sudo systemctl status celery-worker
```

## Testing Celery Setup

### 1. Verify Worker Connection

Start worker and check logs:
```bash
celery -A app.celery_app worker --loglevel=info
```

Expected output:
```
[2024-01-01 12:00:00,000: INFO/MainProcess] Connected to redis://localhost:6379/0
[2024-01-01 12:00:00,001: INFO/MainProcess] mingle: searching for neighbors
[2024-01-01 12:00:00,010: INFO/MainProcess] mingle: all alone
[2024-01-01 12:00:00,020: INFO/MainProcess] celery@hostname ready.
```

### 2. Test Task Execution

**Python shell:**
```python
from app.tasks.ai_labeling import label_workflow_steps

# Queue a test task
result = label_workflow_steps.delay(workflow_id=1)

# Check status
print(result.status)  # Should be 'PENDING' or 'SUCCESS'

# Get result (blocks until complete)
print(result.get(timeout=10))
```

**Expected result:**
```python
{
    'workflow_id': 1,
    'status': 'stub',
    'message': 'Task registered successfully (AI-001 complete)'
}
```

### 3. Monitor Task Execution

**Check Redis queue:**
```bash
redis-cli
> LLEN celery  # Should show pending tasks
> KEYS celery-task-meta-*  # Show completed task results
```

## Configuration

### Celery Settings (`app/celery_app.py`)

| Setting | Value | Purpose |
|---------|-------|---------|
| `task_time_limit` | 300s | Hard limit (5 minutes) |
| `task_soft_time_limit` | 270s | Soft limit (4.5 minutes) |
| `worker_concurrency` | 5 | Max parallel tasks (AI rate limiting) |
| `task_acks_late` | True | Acknowledge after completion |
| `task_autoretry_for` | (Exception,) | Auto-retry on any exception |
| `task_retry_kwargs` | max_retries=3 | Retry up to 3 times |
| `task_retry_backoff` | True | Exponential backoff |

### Queue Configuration

- **Default queue**: General background tasks
- **ai_labeling queue**: AI labeling tasks (priority routing)

## Troubleshooting

### Worker won't start

**Error:** `Error: Invalid -A option`
```bash
# Make sure you're in the backend directory
cd backend
# Activate virtualenv
source venv/bin/activate
# Try with full path
celery -A app.celery_app worker --loglevel=info
```

### Redis connection refused

**Error:** `Error 111 connecting to localhost:6379. Connection refused.`
```bash
# Check if Redis is running
redis-cli ping

# If not, start Redis
brew services start redis  # macOS
sudo systemctl start redis  # Linux
```

### Tasks not processing

1. **Check worker is running**: `ps aux | grep celery`
2. **Check Redis connection**: `redis-cli ping`
3. **Check queue**: `redis-cli LLEN celery`
4. **Check worker logs**: Look for errors in terminal output
5. **Test in eager mode**: Set `task_always_eager=True` in config

### Memory issues

**Worker consuming too much memory:**
```bash
# Limit worker concurrency
celery -A app.celery_app worker --concurrency=2

# Enable worker pool restarts
celery -A app.celery_app worker --max-tasks-per-child=100
```

## Monitoring & Maintenance

### Log Files

**Development**: Console output (stderr/stdout)

**Production**: 
- Worker logs: `/var/log/celery/worker.log`
- Error logs: `/var/log/celery/error.log`

### Health Checks

**Check worker status:**
```bash
celery -A app.celery_app inspect active
celery -A app.celery_app inspect stats
```

**Purge failed tasks:**
```bash
celery -A app.celery_app purge
```

### Scaling

**Multiple workers:**
```bash
# Start 3 workers
celery -A app.celery_app worker --concurrency=5 --hostname=worker1@%h &
celery -A app.celery_app worker --concurrency=5 --hostname=worker2@%h &
celery -A app.celery_app worker --concurrency=5 --hostname=worker3@%h &
```

## Next Steps

1. ✅ **AI-001 Complete**: Celery infrastructure set up
2. **AI-002**: Implement AI service layer (Claude API integration)
3. **AI-003**: Complete `label_workflow_steps` task implementation
4. **Testing**: Integration tests for full workflow

## References

- [Celery Documentation](https://docs.celeryq.dev/)
- [Redis Quick Start](https://redis.io/docs/getting-started/)
- [FastAPI + Celery](https://fastapi.tiangolo.com/async/#background-tasks)
