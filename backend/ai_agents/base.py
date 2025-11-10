# backend/ai_agents/base.py
from langchain_google_genai import ChatGoogleGenerativeAI
from langchain_core.messages import HumanMessage
from langchain_core.prompts import ChatPromptTemplate
from gemini_config import MODELS
import os

class BaseAgent:
    """Base class for all AI agents using Gemini models."""

    def __init__(self, role: str, temperature: float = 0.6):
        self.role = role
        self.model_name = MODELS.get(role)
        if not self.model_name:
            raise ValueError(f"No model configured for role: {role}")

        self.llm = ChatGoogleGenerativeAI(
            model=self.model_name,
            api_key=os.getenv("GEMINI_API_KEY"),
            temperature=temperature,
        )

    async def run(self, prompt: str, context: dict | None = None) -> str:
        """Run the model with a given prompt and optional context."""
        try:
            formatted_prompt = self.format_prompt(prompt, context)
            response = await self.llm.ainvoke([HumanMessage(content=formatted_prompt)])
            return response.content
        except Exception as e:
            print(f"[{self.role}] Error: {e}")
            return f"Error: {str(e)}"

    def format_prompt(self, prompt: str, context: dict | None = None) -> str:
        """Customize prompt format per agent."""
        if context:
            ctx_text = "\n".join([f"{k}: {v}" for k, v in context.items()])
            return f"{prompt}\n\nContext:\n{ctx_text}"
        return prompt
