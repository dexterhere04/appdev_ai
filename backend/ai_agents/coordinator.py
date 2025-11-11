import json
from ai_agents.creative_director import CreativeDirectorAgent
from ai_agents.ux_architect import UXArchitectAgent
from ai_agents.ui_designer import UIDesignerAgent
from ai_agents.critic import CriticAgent
from ai_agents.codewriter import CodewriterAgent
from ai_agents.stylist import StylistAgent

class CoordinatorAgent:
    def __init__(self):
        self.director = CreativeDirectorAgent()
        self.architect = UXArchitectAgent()
        self.ui_designer = UIDesignerAgent()
        self.critic = CriticAgent()
        self.codewriter = CodewriterAgent()
        self.stylist = StylistAgent()

    async def generate_design(self, user_prompt: str):
        vision = await self.director.create_vision(user_prompt)
        ux = await self.architect.design_structure(vision)
        ui = await self.ui_designer.design_ui(ux)
        critique = await self.critic.review_design(ui)

        # if critique finds major issues, loop back once
        if "issues" in critique.lower():
            ui = await self.ui_designer.design_ui(f"{ux}\n\nFeedback:\n{critique}")

        code = await self.codewriter.generate_code(ux)
        styled = await self.stylist.apply_style(code)

        return json.dumps({
            "vision": vision,
            "ux": ux,
            "ui": ui,
            "critique": critique,
            "final_code": styled
        }, indent=2)
