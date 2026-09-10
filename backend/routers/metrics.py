import metrics
from fastapi import APIRouter

router = APIRouter(tags=["metrics"])


@router.get("/metrics")
def metrics_endpoint():
    """In-process counters for scraping/alerting (Agent 8)."""
    data = metrics.counters()
    lines = []
    for name in sorted(data):
        lines.append(f"fcb_{name} {data[name]}")
    from fastapi.responses import PlainTextResponse
    return PlainTextResponse("\n".join(lines) + "\n", media_type="text/plain")
