"""Rate-limit regression (Agent 3). Enables the limiter for this test only."""
import config
import ratelimit


def test_sliding_window_blocks_over_limit(monkeypatch):
    monkeypatch.setattr(config, "RATE_LIMIT_ENABLED", True)
    ratelimit._windows.clear()
    key = "test:1.2.3.4"
    limit = config.RATE_LIMIT_AUTH_PER_MIN
    allowed = sum(1 for _ in range(limit) if ratelimit.check_limit(key, limit))
    assert allowed == limit
    # next call within the same minute is blocked
    assert ratelimit.check_limit(key, limit) is False


def test_disabled_always_allows(monkeypatch):
    monkeypatch.setattr(config, "RATE_LIMIT_ENABLED", False)
    assert ratelimit.check_limit("anything", 0) is True
