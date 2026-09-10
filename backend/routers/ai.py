import json

import ai_pipeline
import workspace as ws
from .deps import require_project
from models.project import Project
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

router = APIRouter(prefix="/api/projects/{pid}/ai", tags=["ai"])


class AIGenerateRequest(BaseModel):
    prompt: str = ""


def _base(project: Project):
    return ws.project_base(project.owner_id, project.id)


@router.post("/generate")
async def ai_generate(project: Project = Depends(require_project), req: AIGenerateRequest = ...):
    prompt = req.prompt.strip()
    if not prompt:
        raise HTTPException(400, "Missing 'prompt'")
    if len(prompt) > 2000:
        raise HTTPException(400, "prompt too long (max 2000 chars)")

    base = _base(project)
    try:
        result = await ai_pipeline.run_pipeline(prompt, base)
    except ai_pipeline.AIPipelineError as e:
        raise HTTPException(400, f"AI generation rejected: {e}")
    except Exception as e:
        raise HTTPException(502, f"AI generation failed: {e}")
    return result


@router.post("/generate/stream")
async def ai_generate_stream(project: Project = Depends(require_project), req: AIGenerateRequest = ...):
    """SSE variant of /generate that streams agent-by-agent progress, ending
    with a single `__AI_DONE__ <json>` event carrying the final payload."""
    prompt = req.prompt.strip()
    if not prompt:
        raise HTTPException(400, "Missing 'prompt'")
    if len(prompt) > 2000:
        raise HTTPException(400, "prompt too long (max 2000 chars)")

    base = _base(project)
    queue: list[str] = []

    async def event_gen():
        try:
            def on_step(step, status, detail):
                if step:
                    queue.append(f"data: {json.dumps({'step': step, 'status': status})}\n\n")

            result = await ai_pipeline.run_pipeline(prompt, base, on_step=on_step)
            for msg in queue:
                yield msg
            yield f"data: __AI_DONE__ {json.dumps(result)}\n\n"
        except ai_pipeline.AIPipelineError as e:
            yield f"data: __AI_ERROR__ {json.dumps({'detail': str(e)})}\n\n"
        except Exception as e:
            yield f"data: __AI_ERROR__ {json.dumps({'detail': f'AI generation failed: {e}'})}\n\n"

    return StreamingResponse(event_gen(), media_type="text/event-stream")
