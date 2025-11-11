from ai_agents.base import BaseAgent
from langchain_core.prompts import ChatPromptTemplate
from langchain_core.runnables import RunnableSequence
from langchain_core.output_parsers import StrOutputParser

class StylistAgent(BaseAgent):
    def __init__(self):
        super().__init__("stylist", temperature=0.4)

    async def apply_style(self, files_json: str):
        prompt = ChatPromptTemplate.from_template("""
        You are a Flutter code stylist.
        Apply consistent formatting, typography, and Material 3 color theming.

        Input files (JSON):
        {files_json}

        Return the updated JSON with styled code content only.
        """)
        chain = RunnableSequence(prompt | self.llm | StrOutputParser())
        return await chain.ainvoke({"files_json": files_json})
