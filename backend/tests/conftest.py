"""
Test configuration and fixtures.
Following extreme TDD - setting up test infrastructure before any implementation.
"""
import pytest
from typing import AsyncGenerator
from httpx import AsyncClient
from fastapi import FastAPI
import asyncio


@pytest.fixture
async def app() -> FastAPI:
    """Create a test FastAPI application instance."""
    # Import will fail initially - that's expected in TDD!
    # We're defining what we WANT to exist
    from src.main import create_app
    
    return create_app()


@pytest.fixture
async def client(app: FastAPI) -> AsyncGenerator[AsyncClient, None]:
    """Create an async test client for the FastAPI app."""
    from fastapi.testclient import TestClient
    from httpx import AsyncClient, ASGITransport
    
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac


@pytest.fixture(scope="session")
def event_loop():
    """Create an event loop for the test session."""
    loop = asyncio.get_event_loop_policy().new_event_loop()
    yield loop
    loop.close()