"""Agent 3 regression: env scrubbing + lifecycle GC + rate limits."""
import os

import envpolicy


def test_build_env_has_no_secrets():
    old = os.environ.get("FCB_SECRET")
    os.environ["GEMINI_API_KEY"] = "leak-me"
    os.environ["FCB_SECRET"] = "super-secret"
    os.environ["LANGCHAIN_API_KEY"] = "leak-me"
    try:
        env = envpolicy.build_env()
        assert envpolicy.is_secret_free(env)
        for k in env:
            assert not any(
                s in k.lower() for s in ("gemini", "langchain", "secret", "token", "fcb_")
            ), k
    finally:
        os.environ.pop("GEMINI_API_KEY", None)
        os.environ.pop("LANGCHAIN_API_KEY", None)
        if old is None:
            os.environ.pop("FCB_SECRET", None)
        else:
            os.environ["FCB_SECRET"] = old


def test_purge_expired_sessions():
    import db

    user = db.create_user("expire@test.dev", "x")
    import datetime

    # insert an already-expired session directly
    past = (datetime.datetime.now(datetime.timezone.utc) - datetime.timedelta(days=1)).isoformat()
    with db._connect() as conn:
        conn.execute(
            "INSERT INTO sessions (token_hash, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)",
            ("deadbeef", user.id, past, past),
        )
    from lifecycle import purge_expired_sessions

    assert purge_expired_sessions() >= 1
    assert db.user_for_session("deadbeef") is None
