# backend/ai_agents/coordinator.py
from ai_agents.planner import PlannerAgent
from ai_agents.codewriter import CodeWriterAgent
from ai_agents.reviewer import ReviewerAgent
from ai_agents.stylist import StylistAgent

class CoordinatorAgent:
    def __init__(self, llm):
        self.llm = llm
        self.planner = PlannerAgent(llm)
        self.codewriter = CodeWriterAgent(llm)
        self.reviewer = ReviewerAgent(llm)
        self.stylist = StylistAgent(llm)

    async def generate_app(self, prompt: str):
        # 1️⃣ Plan
        plan = await self.planner.create_plan(prompt)

        # 2️⃣ Generate initial code
        files = await self.codewriter.generate_code(plan)

        # 3️⃣ Review and fix issues
        reviewed_files = await self.reviewer.review_code(files)

        # 4️⃣ Apply stylistic improvements
        final_files = await self.stylist.apply_style(reviewed_files)

        return {
            "plan": plan,
            "files": final_files,
        }
