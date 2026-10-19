#!/usr/bin/env python3
"""Assemble the single-file game (index.html) from src/.

src/page.html  markup and styles, with /*__ENGINE__*/ and /*__UI3D__*/ slots
src/engine.js  physics, rooms and gadgets (no DOM; also runs under Node for the tools)
src/plan.js    2D floor-plan drawing used for the room thumbnails
src/ui.js      three.js scene, touch controls and game flow (/*__PLAN__*/ slot)
"""
from pathlib import Path

root = Path(__file__).parent
src = root / 'src'

page = (src / 'page.html').read_text()
engine = (src / 'engine.js').read_text()
engine = engine[:engine.index('// ===ENGINE END===')]
ui = (src / 'ui.js').read_text().replace('/*__PLAN__*/', (src / 'plan.js').read_text())
body = page.replace('/*__ENGINE__*/', engine).replace('/*__UI3D__*/', ui)

# Everything before the app markup (title, fonts, styles) belongs in <head>.
split = body.index('<div id="app">')
head, rest = body[:split], body[split:]

reset = """<style>
:root { padding-top: env(safe-area-inset-top, 0px); padding-bottom: env(safe-area-inset-bottom, 0px); }
body { margin: 0; font: 14px/1.4 system-ui, -apple-system, sans-serif; }
img { max-width: 100%; }
[hidden] { display: none !important; }
</style>"""

html = f"""<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="theme-color" content="#161a24">
{reset}
{head.strip()}
</head>
<body>
{rest.strip()}
</body>
</html>
"""
(root / 'index.html').write_text(html)
print(f'index.html: {len(html) // 1024} KB')
