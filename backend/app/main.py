"""
FastAPI application entry point for Workflow Automation Platform.
"""
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager

# Import routers
from app.api import auth, screenshots, workflows


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
