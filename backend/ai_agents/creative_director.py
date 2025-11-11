from langchain_core.prompts import ChatPromptTemplate
from gemini_config import get_runnable_llm

class CreativeDirectorAgent:
    """Agent responsible for defining the app's vision, tone, and design direction."""

    def __init__(self):
        self.llm = get_runnable_llm("planner", temperature=0.5)

        self.chain = (
            ChatPromptTemplate.from_template("""
You are a Creative Director for Flutter apps.
Define the overall *vision* for this app idea.

User request:
{user_prompt}

Return only valid JSON strictly matching keys:
["theme_mood", "color_palette", "design_style", "tone", "inspiration_references"]
""")
            | self.llm
        ).with_config({"tags": ["CreativeDirector", "DesignPipeline"]})

    async def create_vision(self, user_prompt: str):
        """Generates the creative vision for a given app idea."""
        result = await self.chain.ainvoke({"user_prompt": user_prompt})
        return result.content if hasattr(result, "content") else result
