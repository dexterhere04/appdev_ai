import asyncio
import json
from ai_agents.coordinator import CoordinatorAgent

async def main():
    print("🧠 Initializing multi-agent workflow...\n")

    coordinator = CoordinatorAgent()

    # ---- USER INPUT ----
    user_prompt = (
        "A productivity app that combines a daily task list "
        "with motivational quotes and progress tracking using Flutter."
    )

    print("🎬 Starting design workflow for prompt:")
    print(f"   '{user_prompt}'\n")

    # ---- RUN WORKFLOW ----
    print("🎨 [1/6] Generating creative vision...")
    vision = await coordinator.director.create_vision(user_prompt)
    print("✅ Vision created!\n")

    print("🧩 [2/6] Designing UX structure...")
    ux = await coordinator.architect.design_structure(vision)
    print("✅ UX structure ready!\n")

    print("🪄 [3/6] Generating UI layouts...")
    ui = await coordinator.ui_designer.design_ui(ux)
    print("✅ UI layouts generated!\n")

    print("🧐 [4/6] Reviewing UI for quality...")
    critique = await coordinator.critic.review_design(ui)
    print("✅ UI critique completed!\n")

    # Optional feedback loop
    if "issues" in critique.lower():
        print("🔁 Issues found! Revising UI with feedback...")
        ui = await coordinator.ui_designer.design_ui(f"{ux}\n\nFeedback:\n{critique}")
        print("✅ Revised UI created!\n")

    print("💻 [5/6] Writing Flutter app skeleton...")
    code = await coordinator.codewriter.generate_code(ux)
    print("✅ Core app code generated!\n")

    print("✨ [6/6] Applying stylistic improvements...")
    styled = await coordinator.stylist.apply_style(code)
    print("✅ Final styled code ready!\n")

    # ---- COMBINE RESULTS ----
    output = {
        "vision": vision,
        "ux": ux,
        "ui": ui,
        "critique": critique,
        "final_code": styled
    }

    output_file = "output/app_design_output.json"
    with open(output_file, "w", encoding="utf-8") as f:
        json.dump(output, f, indent=2, ensure_ascii=False)

    print("📁 All stages complete!")
    print(f"📝 Full output saved to: {output_file}\n")

    # ---- Optional summary ----
    print("✅ Summary:")
    print("  - Vision:", vision[:200], "...")
    print("  - UX:", ux[:200], "...")
    print("  - Critique:", critique[:200], "...")
    print("\n🎉 Workflow finished successfully!\n")

if __name__ == "__main__":
    asyncio.run(main())
