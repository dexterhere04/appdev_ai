from ai_agents.base import BaseAgent
from langchain_core.prompts import ChatPromptTemplate
from langchain_core.runnables import RunnableSequence
from langchain_core.output_parsers import StrOutputParser

class UIDesignerAgent(BaseAgent):
    def __init__(self):
        super().__init__("codewriter", temperature=0.6)

    async def design_ui(self, ux_json: str):
        prompt = ChatPromptTemplate.from_template("""
        You are a Flutter UI designer following Material 3.
        Generate the core widget layout for each screen in this UX plan:

        {ux_json}

        Use good naming, spacing, and theming conventions.
        Return JSON list of objects: [{{"file": "dashboard.dart", "content": "<code>"}}]
        """)
        chain = RunnableSequence(prompt | self.llm | StrOutputParser())
        return await chain.ainvoke({"ux_json": ux_json})
