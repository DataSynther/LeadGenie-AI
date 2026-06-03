import os
from pathlib import Path
from dotenv import load_dotenv
import anthropic

# 1. Locate the main root folder cleanly
current_run_dir = Path(__file__).resolve().parent
if current_run_dir.name == "backend":
    PROJECT_ROOT = current_run_dir.parent
else:
    PROJECT_ROOT = current_run_dir

load_dotenv(dotenv_path=PROJECT_ROOT / ".env")

def get_code_files():
    """Finds all code files and groups them by their parent folder."""
    valid_extensions = {'.py', '.ts', '.tsx', '.js', '.jsx'}
    ignored_dirs = {'node_modules', '.git', '__pycache__', '.venv', 'venv', 'venvvenv', 'dist', 'build', 'storage', 'diagnostics'}
    ignored_extensions = {'.json', '.jsonl', '.csv', '.log', '.md'}
    
    grouped_files = {}
    
    for file_path in PROJECT_ROOT.rglob("*"):
        if file_path.is_dir() or any(ignored in file_path.parts for ignored in ignored_dirs):
            continue
            
        # Skip nested clone iterations
        try:
            relative_parts = file_path.relative_to(PROJECT_ROOT).parts
            if len(relative_parts) > 1 and "LeadGenie-AI" in relative_parts[:-1]:
                continue
        except ValueError:
            continue

        if file_path.suffix in ignored_extensions or file_path.name in ["make_blueprint.py", "make_full_blueprint.py"]:
            continue

        if file_path.suffix in valid_extensions:
            if file_path.stat().st_size > 80_000: # Skip vendor or giant built files
                continue
                
            # Group by top-level folder name (e.g., 'backend/agents' or 'frontend/src')
            relative_path = file_path.relative_to(PROJECT_ROOT)
            if len(relative_path.parts) > 1:
                group_key = f"{relative_path.parts[0]}/{relative_path.parts[1]}"
            else:
                group_key = relative_path.parts[0]
                
            if group_key not in grouped_files:
                grouped_files[group_key] = []
            grouped_files[group_key].append(file_path)
            
    return grouped_files

def run_chunked_lld():
    grouped_codebase = get_code_files()
    if not grouped_codebase:
        print("❌ No files discovered.")
        return

    api_key = os.getenv("ANTHROPIC_API_KEY") 
    model_name = os.getenv("CLAUDE_MODEL", "claude-3-5-sonnet-20241022")
    client = anthropic.Anthropic(api_key=api_key)

    output_file = PROJECT_ROOT / "FULL_SYSTEM_ARCHITECTURE_LLD.md"
    
    # Reset/Create the file with the Master Title and a clean, high-level diagram
    print("🏗️ Creating foundational High-Level Architecture Shell...")
    
    # Updated prompt targeting executive-level intuition and visuals
    initial_prompt = """Write an # Executive Platform Blueprint for a complex B2B Agentic AI platform named LeadGenie-AI. 
    Generate a beautifully organized, executive-level Macro System Flow Diagram using ```mermaid markup syntax.
    
    CRITICAL GUIDELINES:
    1. Write entirely for business leaders and non-technical stakeholders. Explain the 'Why' and the 'How' in intuitive, conceptual language.
    2. Keep the macro diagram crisp, client-presentable, and focused on the high-level lifecycle (UI -> Backend Orchestration -> Agent Intelligence).
    3. ABSOLUTELY NO DIRECT CODE SNIPPETS.
    
    Only write the overview and the diagram syntax. Start directly with the title '# Executive Platform Blueprint'."""
    
    response = client.messages.create(
        model=model_name, max_tokens=4000, temperature=0.2,
        messages=[{"role": "user", "content": initial_prompt}]
    )
    
    with open(output_file, "w", encoding="utf-8") as f:
        f.write(response.content[0].text + "\n\n")

    print(f"🔄 Processing {len(grouped_codebase)} codebase modules sequentially...")
    
    # Safe character limit per API call payload to avoid context/token bloat (~25k tokens)
    MAX_CHARS_PER_CHUNK = 100_000 

    for module_name, files in grouped_codebase.items():
        print(f"📦 Documenting module group: {module_name} ({len(files)} files)...")
        
        current_chunk_code = ""
        sub_chunk_index = 1
        
        for idx, file_path in enumerate(files):
            try:
                rel = file_path.relative_to(PROJECT_ROOT)
                with open(file_path, "r", encoding="utf-8") as f:
                    file_content = f.read()
                    
                file_payload = f"\n--- FILE: {rel} ---\n{file_content}\n"
                
                # Check if adding this file exceeds our single-call safe size limit
                if len(current_chunk_code) + len(file_payload) > MAX_CHARS_PER_CHUNK and current_chunk_code:
                    # Flush current batch before reading the next file
                    send_lld_request(client, model_name, module_name, current_chunk_code, output_file, sub_chunk_index)
                    sub_chunk_index += 1
                    current_chunk_code = ""
                
                current_chunk_code += file_payload
                
            except Exception as e:
                print(f"⚠️ Could not read file {file_path}: {e}")
                continue

        # Hand off any remaining code left over in the buffer for this module
        if current_chunk_code:
            suffix = sub_chunk_index if sub_chunk_index > 1 else None
            send_lld_request(client, model_name, module_name, current_chunk_code, output_file, suffix)

    print(f"\n🎉 Grand-Master Success! Your entire system has been safely processed chunk by chunk!")
    print(f"📄 Full file generated at: {output_file}")


def send_lld_request(client, model_name, module_name, code_payload, output_file, part_index=None):
    """Helper function to cleanly handle individual API transactions."""
    display_title = f"{module_name} (Part {part_index})" if part_index else module_name
    print(f"   🚀 Sending batch to Claude for: {display_title}...")
    
    # Prompt completely overhauled for business intuition, heavy diagramming, and zero code
    chunk_prompt = f"""You are an elite Solutions Architect and Technical Product Manager. Read the code for this module/component: '{display_title}'.
    
    Write a highly intuitive, business-friendly architectural breakdown for this specific module.
    
    CRITICAL RULES:
    1. **MANDATORY VISUALS:** You MUST create at least one beautiful `mermaid` diagram (flowchart, sequence, or state diagram) mapping out the logical flow, decision trees, or data lifecycle of this specific module. Group concepts into clean subgraphs.
    2. **ZERO RAW CODE:** Do NOT output any raw code blocks, deep syntax, or direct variable listings. 
    3. **BUSINESS VALUE FOCUS:** Translate the logic into plain English. Explain *what* this component achieves, *how* it operates conceptually, and *why* it matters to the overall success of the platform. Use clean formatting, bullet points, and bold text for readability.
    
    Code payload:
    {code_payload}"""

    try:
        chunk_response = client.messages.create(
            model=model_name, 
            max_tokens=8192,  # Maximum supported output tokens for Claude 3.5 Sonnet
            temperature=0.2,
            messages=[{"role": "user", "content": chunk_prompt}]
        )
        
        with open(output_file, "a", encoding="utf-8") as f:
            f.write(f"\n## Module Blueprint: {display_title}\n")
            f.write(chunk_response.content[0].text + "\n")
            
    except Exception as e:
        print(f"   ⚠️ Failed to process block {display_title}: {e}")

if __name__ == "__main__":
    run_chunked_lld()