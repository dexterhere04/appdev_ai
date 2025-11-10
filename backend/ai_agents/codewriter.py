# backend/ai_agents/codewriter.py
from ai_agents.base import BaseAgent

class CodeWriterAgent(BaseAgent):
    """Agent that generates Dart/Flutter code for each planned component."""

    def __init__(self):
        super().__init__(role="codewriter", temperature=0.7)

    async def write_code(self, component_description: str, filename: str | None = None) -> str:
        prompt = f"""
        You are a senior Flutter developer.
        Write clean, production-quality Dart/Flutter code for the following component:

        {component_description}

        - Follow Flutter best practices.
        - Use descriptive variable names.
        - Follow Material 3 design conventions.
        - Avoid redundant comments.
        {"The file name will be " + filename if filename else ""}
        """
        return await self.run(prompt)
