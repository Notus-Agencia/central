import re, sys
dist = open(sys.argv[1]).read(); modelo = open(sys.argv[2]).read()
pre = re.findall(r'<link rel="modulepreload"[^>]*>', dist)
css = re.findall(r'<link rel="stylesheet"[^>]*>', dist)
mod = re.findall(r'<script type="module"[^>]*></script>', dist)
assert len(mod) == 1 and css
linhas = [l for l in modelo.split("\n") if not re.search(r'rel="modulepreload"|rel="stylesheet" crossorigin|<script type="module"', l)]
s = "\n".join(linhas)
s = s.replace('<script src="./teste-dados.js"', "\n".join(pre + css) + '\n<script src="./teste-dados.js"', 1)
s = s.rstrip() + "\n" + mod[0] + "\n"
print(s, end="")
