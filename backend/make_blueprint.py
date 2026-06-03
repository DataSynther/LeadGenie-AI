import os
from pathlib import Path
from dotenv import load_dotenv
import anthropic

# 1. Turn on the magic environment variables
load_dotenv()

def scan_entire_backend():
    print("📸 Magic Camera is scanning your ENTIRE folder layout...")
    
    # Get the folder where this script is sitting
    current_dir = Path(__file__).resolve().parent
    
    # This string will hold all the code we find
    all_code_combined = ""
    
    # 2. Walk through every single file in the folder and subfolders
    # rglob("*.py") means: find all files ending in .py anywhere in this directory tree
    for file_path in current_dir.rglob("*.py"):
        
        # Avoid scanning our own documentation script, or virtual environments/caches
        if file_path.name == "make_blueprint.py" or ".venv" in file_path.parts or "__pycache__" in file_path.parts:
            continue
            
        # Get a clean relative path name (e.g., "agents/outreach/email_beautifier.py")
        relative_path = file_path.relative_to(current_dir)
        print(f"📄 Found file: {relative_path}")
        
        # Read the file and add it to our giant pile of code
        try:
            with open(file_path, "r", encoding="utf-8") as f:
                code_content = f.read()
                
            all_code_combined += f"\n\n=========================================\n"
            all_code_combined += f"FILE PATH: {relative_path}\n"
            all_code_combined += f"=========================================\n"
            all_code_combined += f"{code_content}\n"
        except Exception as e:
            print(f"⚠️ Could not read {relative_path}: {e}")

    if not all_code_combined:
        print("❌ Didn't find any Python files to scan!")
        return

    # 3. Wake up Claude
    client = anthropic.Anthropic(api_key=os.getenv("ANTHROPIC_API_KEY"))
    model = os.getenv("CLAUDE_MODEL", "claude-3-5-sonnet-20241022") # Swapped to Sonnet for larger codebase comprehension

    # 4. Ask Claude to map the entire system
    prompt = f"""You are an elite Lead Software Architect. I have scanned my entire application backend folder and compiled all the source code files below.
    
    Please study the code architecture and write a comprehensive Low-Level Design (LLD) document in Markdown.
    
    Your LLD should contain:
    1. # Executive System Overview (What this entire application does as a system)
    2. # Module Architecture Breakdown (Go folder by folder / module by module and explain the classes and their main responsibilities)
    3. # Data Flows & Component Interactions (Explain how data moves from agents to clients, or script to script based on the code)
    4. # Key Tech Stack & Design Patterns used (e.g., Dependency Injection, Pydantic data validation, Anthropic integrations).
    
    Keep the layout beautiful, clean, structured with markdown headings, and highly professional. Skip conversational introductory phrases.
    
    Here is the entire system codebase:
    {all_code_combined}"""

    print("🤖 Claude is analyzing your whole architecture and rewriting the book...")
    
    response = client.messages.create(
        model=model,
        max_tokens=4000, # Increased max tokens because the output layout will be much larger now
        temperature=0.2,
        messages=[{"role": "user", "content": prompt}]
    )
    
    blueprint_text = response.content[0].text

    # 5. Save the master blueprint!
    with open("SYSTEM_LLD_BLUEPRINT.md", "w", encoding="utf-8") as f:
        f.write(blueprint_text)
        
    print("\n🎉 Master Success! 'SYSTEM_LLD_BLUEPRINT.md' has been generated and encompasses your entire system architecture!")

if __name__ == "__main__":
    scan_entire_backend()

