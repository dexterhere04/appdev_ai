# backend/ai_agents/planner.py
from ai_agents.base import BaseAgent

class PlannerAgent(BaseAgent):
    """Agent that generates project structure and design plan."""

    def __init__(self):
        super().__init__(role="planner", temperature=0.4)

    async def plan_project(self, user_prompt: str) -> str:
        prompt = f"""
        You are a Flutter app architect.
        Based on the following request, outline:
        1. The app's core idea and architecture.
        2. Main screens and components.
        3. Suggested folder structure.
        4. Any important dependencies.

        User request:
        {user_prompt}
        """
        return await self.run(prompt)
