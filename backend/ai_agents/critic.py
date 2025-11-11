from ai_agents.base import BaseAgent
from langchain_core.prompts import ChatPromptTemplate
from langchain_core.runnables import RunnableSequence
from langchain_core.output_parsers import StrOutputParser

class CriticAgent(BaseAgent):
    def __init__(self):
        super().__init__("reviewer", temperature=0.3)

    async def review_design(self, ui_code_json: str):
        prompt = ChatPromptTemplate.from_template("""
        You are a Design Critic specializing in Flutter UI/UX.
        Review the generated layouts critically for:
        - Visual hierarchy
        - Color & spacing
        - Accessibility
        - Material 3 compliance

        Code:
        {ui_code_json}

        Return JSON with keys: issues[], suggestions[]
        """)
        chain = RunnableSequence(prompt | self.llm | StrOutputParser())
        return await chain.ainvoke({"ui_code_json": ui_code_json})
