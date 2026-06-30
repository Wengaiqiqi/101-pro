"""Simple in-memory rate limiter for sensitive endpoints."""
import os
import time
from collections import defaultdict
from threading import Lock
from typing import Any

from fastapi import HTTPException, Request, status


class RateLimiter:
    """Simple in-memory rate limiter using sliding window."""

    def __init__(self):
        self._requests: dict[str, list[float]] = defaultdict(list)
        self._lock = Lock()

    def _clean_old_requests(self, key: str, window_seconds: int):
        """Remove requests older than the window and delete empty keys."""
        now = time.time()
        cutoff = now - window_seconds
        self._requests[key] = [ts for ts in self._requests[key] if ts > cutoff]
        if not self._requests[key]:
            del self._requests[key]

    def is_rate_limited(self, key: str, max_requests: int, window_seconds: int) -> bool:
        """Check if the key has exceeded the rate limit."""
        with self._lock:
            self._clean_old_requests(key, window_seconds)
            return len(self._requests[key]) >= max_requests

    def record_request(self, key: str, window_seconds: int):
        """Record a request for the given key."""
        with self._lock:
            self._clean_old_requests(key, window_seconds)
            self._requests[key].append(time.time())

    def check_and_record(self, key: str, max_requests: int, window_seconds: int) -> bool:
        """Atomically consume one request slot, returning whether it was allowed."""
        with self._lock:
            self._clean_old_requests(key, window_seconds)
            if len(self._requests[key]) >= max_requests:
                return False
            self._requests[key].append(time.time())
            return True

    def reset(self):
        """Reset all rate limit counters (for testing)."""
        with self._lock:
            self._requests.clear()


# Global rate limiter instance
_rate_limiter = RateLimiter()

# Check if rate limiting is disabled (for testing)
_rate_limit_disabled = os.environ.get("DISABLE_RATE_LIMIT", "").lower() in ("1", "true", "yes")


def _get_client_ip(request: Request) -> str:
    """Get the real client IP, preferring X-Forwarded-For behind proxies."""
    forwarded = request.headers.get("X-Forwarded-For", "")
    if forwarded:
        # Take the leftmost IP (original client).
        client_ip = forwarded.split(",")[0].strip()
        if client_ip:
            return client_ip
    return request.client.host if request.client else "unknown"


def check_rate_limit(request: Request, max_requests: int = 5, window_seconds: int = 300):
    """
    FastAPI dependency to check rate limit based on client IP and endpoint.

    Args:
        request: FastAPI request object
        max_requests: Maximum number of requests allowed in the window
        window_seconds: Time window in seconds (default: 5 minutes)

    Raises:
        HTTPException: If rate limit is exceeded
    """
    # Skip rate limiting if disabled (e.g., in tests)
    if _rate_limit_disabled:
        return

    client_ip = _get_client_ip(request)
    endpoint = request.url.path
    key = f"{client_ip}:{endpoint}"

    if not _rate_limiter.check_and_record(key, max_requests, window_seconds):
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=f"请求过于频繁，请在 {window_seconds // 60} 分钟后再试",
            headers={"Retry-After": str(window_seconds)},
        )


def reset_rate_limiter():
    """Reset the rate limiter (for testing)."""
    _rate_limiter.reset()
