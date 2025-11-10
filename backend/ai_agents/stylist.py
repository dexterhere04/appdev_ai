# backend/ai_agents/stylist.py
import asyncio

class StylistAgent:
    def __init__(self, llm):
        self.llm = llm

    async def _style_file(self, file_obj: dict):
        """Applies stylistic improvements to code (consistent formatting, naming)."""
        system = """
You are a Dart formatter and code style expert.
Improve readability and consistency of the given Dart file.
Use Material 3 conventions and good naming.
Return only the styled Dart code — no markdown or text.
        """

        prompt = f"{system}\n\nFile path: {file_obj['path']}\nCode:\n{file_obj['content']}"

        response = await self.llm.ainvoke(prompt)
        return {"path": file_obj["path"], "content": response.content.strip()}

    async def apply_style(self, files: list[dict]):
        """Apply style fixes concurrently to all files."""
        return await asyncio.gather(*[self._style_file(f) for f in files])
