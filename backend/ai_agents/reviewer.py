# backend/ai_agents/reviewer.py
import json
import asyncio

class ReviewerAgent:
    def __init__(self, llm):
        self.llm = llm

    async def _review_file(self, file_obj: dict):
        """Reviews a single file and fixes common syntax issues."""
        system = """
You are a strict Flutter code reviewer. Check syntax and structure.
Return only the corrected Dart code. If fine, return the same code.
No markdown or explanations.
        """

        prompt = f"{system}\n\nFile path: {file_obj['path']}\nCode:\n{file_obj['content']}\n\nReturn corrected code only."

        response = await self.llm.ainvoke(prompt)
        return {"path": file_obj["path"], "content": response.content.strip()}

    async def review_code(self, files: list[dict]):
        """Review all files in parallel."""
        return await asyncio.gather(*[self._review_file(f) for f in files])
