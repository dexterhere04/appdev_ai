import asyncio
from ai_agents.coordinator import CoordinatorAgent

async def main():
    coord = CoordinatorAgent()
    result = await coord.generate_design("A personal finance tracker with smart budgets and analytics.")
    print(result)

if __name__ == "__main__":
    asyncio.run(main())
