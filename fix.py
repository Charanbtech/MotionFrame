import os, re
count = 0
for root, dirs, files in os.walk('g:/MotionFrame/src'):
    for f in files:
        if f.endswith(('.jsx', '.js')):
            p = os.path.join(root, f)
            with open(p, 'r', encoding='utf8') as file:
                content = file.read()
            
            new_content = re.sub(r"(\$\{API_BASE_URL\}[^`\n]+?)',\s*\{", r"\1`, {", content)
            new_content = re.sub(r"(\$\{API_BASE_URL\}[^`\n]+?)'\)", r"\1`)", new_content)
            new_content = re.sub(r"(\$\{API_BASE_URL\}[^`\n]+?)';", r"\1`;", new_content)
            
            if new_content != content:
                with open(p, 'w', encoding='utf8') as file:
                    file.write(new_content)
                print('Fixed', p)
                count += 1
print(f"Fixed {count} files")
