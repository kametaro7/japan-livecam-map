#!/usr/bin/env python3
"""
data/cameras.json の各カメラについて、現在の配信 (video) がまだライブかを確認し、
終了していればチャンネルの「現在のライブ配信」に差し替えます。結果は
data/cameras.json と data/cameras.js に書き戻します。API キー不要。

使い方:
  python3 tools/update_streams.py            # 全件チェック（1件あたり約1秒）
  python3 tools/update_streams.py --only 東京 # 名前/都道府県に「東京」を含むものだけ
  python3 tools/update_streams.py --dry-run  # 書き込まずに結果だけ表示
"""
import json, re, sys, time, os, datetime, urllib.request, urllib.error

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
JSON_PATH = os.path.join(ROOT, 'data', 'cameras.json')
JS_PATH = os.path.join(ROOT, 'data', 'cameras.js')
UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Safari/537.36'
HDR = {'User-Agent': UA, 'Accept-Language': 'ja,en;q=0.8', 'Cookie': 'PREF=hl=ja&gl=JP; CONSENT=YES+cb'}

def fetch(url):
    req = urllib.request.Request(url, headers=HDR)
    with urllib.request.urlopen(req, timeout=30) as r:
        return r.read().decode('utf-8', 'replace')

def video_is_live(video_id):
    """watch ページの ytInitialPlayerResponse から isLiveNow を読む。"""
    try:
        html = fetch('https://www.youtube.com/watch?v=' + video_id)
    except urllib.error.HTTPError as e:
        return False, 'http %s' % e.code
    except Exception as e:
        return None, str(e)
    if '"isLiveNow":true' in html or '"isLive":true' in html:
        return True, 'live:' + ('embed' if '"playableInEmbed":true' in html else 'noembed')
    if 'Video unavailable' in html or '"status":"ERROR"' in html:
        return False, 'unavailable'
    return False, 'ended'

def channel_live_video(channel_id):
    """/channel/<id>/live から現在のライブ配信の videoId を取り出す。"""
    try:
        html = fetch('https://www.youtube.com/channel/%s/live' % channel_id)
    except Exception as e:
        return None, str(e)
    m = re.search(r'<link rel="canonical" href="https://www\.youtube\.com/watch\?v=([\w-]{11})"', html)
    if not m:
        return None, 'no live'
    vid = m[1]
    if '"isLiveNow":true' not in html and '"isLive":true' not in html:
        return None, 'canonical %s but not live' % vid
    return vid, 'ok'

def write_js(data):
    with open(JS_PATH, 'w', encoding='utf-8') as f:
        f.write('// 自動生成: tools/build_data.py または tools/update_streams.py が書き出します。手で編集する場合は cameras.json を編集してください。\n')
        f.write('window.CAMERAS_UPDATED = %s;\n' % json.dumps(data['updated']))
        f.write('window.CAMERAS = ' + json.dumps(data['cameras'], ensure_ascii=False, separators=(',', ':')) + ';\n')

def main():
    args = sys.argv[1:]
    dry = '--dry-run' in args
    only = None
    if '--only' in args:
        only = args[args.index('--only') + 1]
    data = json.load(open(JSON_PATH, encoding='utf-8'))
    cams = data['cameras']
    used = {c['video'] for c in cams}
    changed = 0; offline = 0; checked = 0
    for c in cams:
        if only and only not in (c['name'] + c['pref'] + c.get('city', '')):
            continue
        checked += 1
        live, why = video_is_live(c['video'])
        if live:
            if c.pop('offline', None) is not None: changed += 1
            # 埋め込み再生が許可されているか（不可ならランダムの対象から外れる）
            if why.endswith('noembed'):
                if not c.get('noembed'): c['noembed'] = True; changed += 1
            elif c.pop('noembed', None) is not None:
                changed += 1
            print(f"OK   {c['name']} ({c['video']}) {why}")
        elif live is None:
            print(f"?    {c['name']} ({c['video']}): {why}")
        else:
            new_vid, w2 = channel_live_video(c['channel']) if c.get('channel') else (None, 'no channel')
            if new_vid and new_vid not in used:
                print(f"NEW  {c['name']}: {c['video']} -> {new_vid}")
                used.discard(c['video']); used.add(new_vid)
                c['video'] = new_vid; c.pop('offline', None); changed += 1
            else:
                print(f"OFF  {c['name']} ({c['video']}): {why}; channel: {w2}")
                if not c.get('offline'): c['offline'] = True; changed += 1
                offline += 1
        time.sleep(1.0)
    data['updated'] = datetime.date.today().isoformat()
    print(f'checked={checked} changed={changed} offline={offline}')
    if dry:
        print('(dry-run: 書き込みなし)'); return
    json.dump(data, open(JSON_PATH, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    write_js(data)
    print('wrote', JSON_PATH, 'and', JS_PATH)

if __name__ == '__main__':
    main()
