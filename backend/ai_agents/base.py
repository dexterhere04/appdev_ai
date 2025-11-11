from langchain_core.messages import HumanMessage
from gemini_config import get_runnable_llm, prebuilt_runnables


class BaseAgent:
    def __init__(self, role: str, temperature: float = 0.6):
        self.role = role
        self.llm = prebuilt_runnables.get(role) or get_runnable_llm(role, temperature=temperature)

    async def run(self, prompt: str, context: dict | None = None) -> str:
        formatted = self.format_prompt(prompt, context)
        try:
            response = await self.llm.ainvoke([HumanMessage(content=formatted)])
            return response.content
        except Exception as e:
            return f"Error: {e}"

    def format_prompt(self, prompt: str, context: dict | None = None) -> str:
        if context:
            ctx = "\n".join(f"{k}: {v}" for k, v in context.items())
            return f"{prompt}\n\nContext:\n{ctx}"
        return prompt
