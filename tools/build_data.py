#!/usr/bin/env python3
"""
data/cameras.json から data/cameras.js を生成します（cameras.json を手で編集したあとに実行）。
  python3 tools/build_data.py
"""
import json, os, datetime
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
src = os.path.join(ROOT, 'data', 'cameras.json')
dst = os.path.join(ROOT, 'data', 'cameras.js')
data = json.load(open(src, encoding='utf-8'))
ids = [c['id'] for c in data['cameras']]
assert len(ids) == len(set(ids)), '重複した id があります'
for c in data['cameras']:
    for k in ('id', 'name', 'pref', 'lat', 'lng', 'cat', 'video'):
        assert k in c, f'{c.get("id")}: {k} がありません'
data['updated'] = datetime.date.today().isoformat()
json.dump(data, open(src, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
with open(dst, 'w', encoding='utf-8') as f:
    f.write('// 自動生成: tools/build_data.py または tools/update_streams.py が書き出します。手で編集する場合は cameras.json を編集してください。\n')
    f.write('window.CAMERAS_UPDATED = %s;\n' % json.dumps(data['updated']))
    f.write('window.CAMERAS = ' + json.dumps(data['cameras'], ensure_ascii=False, separators=(',', ':')) + ';\n')
print('wrote', dst, len(data['cameras']), 'cameras')
