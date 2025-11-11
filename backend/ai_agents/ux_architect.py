from ai_agents.base import BaseAgent
from langchain_core.prompts import ChatPromptTemplate
from langchain_core.runnables import RunnableSequence
from langchain_core.output_parsers import StrOutputParser

class UXArchitectAgent(BaseAgent):
    def __init__(self):
        super().__init__("planner", temperature=0.4)

    async def design_structure(self, vision_json: str):
        prompt = ChatPromptTemplate.from_template("""
        You are a UX Architect.
        Using this vision:
        {vision_json}

        Design:
        1. List of main screens
        2. Navigation pattern (bottom bar, tabs, drawer, FAB)
        3. Component hierarchy per screen
        4. Accessibility & responsive design principles

        Return JSON with keys: screens, navigation, components, accessibility.
        """)
        chain = RunnableSequence(prompt | self.llm | StrOutputParser())
        return await chain.ainvoke({"vision_json": vision_json})
