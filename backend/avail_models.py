# backend/test_agents.py
import asyncio
from ai_agents.planner import PlannerAgent
from ai_agents.codewriter import CodeWriterAgent

async def main():
    planner = PlannerAgent()
    codewriter = CodeWriterAgent()

    print("🧠 Planning app...")
    plan = await planner.plan_project("A Flutter app that tracks daily habits and progress with charts.")
    print(plan)

    print("\n💻 Generating code...")
    code = await codewriter.write_code("A dashboard screen that shows weekly habit completion as a bar chart.")
    print(code)

asyncio.run(main())
