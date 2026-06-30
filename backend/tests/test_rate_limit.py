"""Tests for rate limiter."""
import time
from unittest.mock import patch

from app.core.rate_limit import RateLimiter


class TestRateLimiter:
    def setup_method(self):
        self.limiter = RateLimiter()

    def test_not_limited_initially(self):
        assert self.limiter.is_rate_limited("test", 5, 60) is False

    def test_records_requests(self):
        self.limiter.record_request("test", 60)
        assert self.limiter.is_rate_limited("test", 1, 60) is True

    def test_different_keys_independent(self):
        self.limiter.record_request("key1", 60)
        assert self.limiter.is_rate_limited("key1", 1, 60) is True
        assert self.limiter.is_rate_limited("key2", 1, 60) is False

    def test_window_expiry(self):
        with patch("time.time", return_value=1000):
            self.limiter.record_request("test", 10)
        with patch("time.time", return_value=1011):
            assert self.limiter.is_rate_limited("test", 1, 10) is False

    def test_reset_clears_all(self):
        self.limiter.record_request("test", 60)
        self.limiter.reset()
        assert self.limiter.is_rate_limited("test", 1, 60) is False

    def test_max_requests_boundary(self):
        for _ in range(3):
            self.limiter.record_request("test", 60)
        assert self.limiter.is_rate_limited("test", 3, 60) is True
        assert self.limiter.is_rate_limited("test", 4, 60) is False

    def test_check_and_record_is_atomic(self):
        assert self.limiter.check_and_record("test", 1, 60) is True
        assert self.limiter.check_and_record("test", 1, 60) is False
