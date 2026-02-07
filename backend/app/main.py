"""
FastAPI application entry point for Workflow Automation Platform.
"""
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import JSONResponse
from contextlib import asynccontextmanager
from pathlib import Path
from slowapi.errors import RateLimitExceeded

# Import routers
from app.api import auth, screenshots, workflows, steps, healing, company, invites, notifications, health, users, dynamic_workflows
from app.utils.rate_limit import limiter


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan manager for startup/shutdown events."""
    # Startup: Initialize database, connections, etc.
    print("🚀 Starting Workflow Platform API...")
    yield
    # Shutdown: Clean up resources
    print("👋 Shutting down Workflow Platform API...")


app = FastAPI(
    title="Workflow Automation Platform API",
    description="API for recording, managing, and executing interactive workflows",
    version="0.1.0",
    lifespan=lifespan,
)

# Rate limiting setup
app.state.limiter = limiter


@app.exception_handler(RateLimitExceeded)
async def rate_limit_handler(request: Request, exc: RateLimitExceeded):
    """Custom handler for rate limit exceeded errors."""
    return JSONResponse(
        status_code=429,
        content={
            "error": {
                "code": "RATE_LIMIT_EXCEEDED",
                "message": "Too many requests. Please try again later.",
            }
        },
        headers={"Retry-After": str(exc.detail)},
    )


# CORS Configuration
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",  # Dashboard
        "chrome-extension://*",  # Chrome extension
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/")
async def root():
    """Health check endpoint."""
    return {
        "status": "healthy",
        "service": "Workflow Platform API",
        "version": "0.1.0",
    }


# Register API routers
app.include_router(auth.router, prefix="/api/auth", tags=["Authentication"])
app.include_router(screenshots.router, prefix="/api", tags=["Screenshots"])
app.include_router(workflows.router, prefix="/api/workflows", tags=["Workflows"])
app.include_router(steps.router, prefix="/api/steps", tags=["Steps"])
app.include_router(healing.router, prefix="/api/healing", tags=["Healing"])
app.include_router(company.router, prefix="/api/companies", tags=["Company"])
app.include_router(invites.router, prefix="/api/invites", tags=["Invites"])
app.include_router(notifications.router, prefix="/api/notifications", tags=["Notifications"])
app.include_router(health.router, prefix="/api/health", tags=["Health Dashboard"])
app.include_router(users.router, prefix="/api/users", tags=["Users"])
app.include_router(dynamic_workflows.router, prefix="/api/dynamic-workflows", tags=["Dynamic Workflows"])

# Mount static files for screenshot storage (MVP only)
screenshots_dir = Path(__file__).parent.parent / "screenshots"
screenshots_dir.mkdir(exist_ok=True)
app.mount("/screenshots", StaticFiles(directory=str(screenshots_dir)), name="screenshots")
