from ai_agents.base import BaseAgent
from langchain_core.prompts import ChatPromptTemplate
from langchain_core.runnables import RunnableSequence
from langchain_core.output_parsers import StrOutputParser

class CodewriterAgent(BaseAgent):
    def __init__(self):
        super().__init__("codewriter", temperature=0.5)

    async def generate_code(self, ux_plan: str):
        prompt = ChatPromptTemplate.from_template("""
        You are a Flutter developer.
        Based on the UX plan, generate boilerplate Dart files for each screen.

        UX plan:
        {ux_plan}

        Return JSON list: [{{"file": "screen.dart", "content": "<dart code>"}}]
        """)
        chain = RunnableSequence(prompt | self.llm | StrOutputParser())
        return await chain.ainvoke({"ux_plan": ux_plan})
