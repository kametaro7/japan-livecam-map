import json, re, sys, time, urllib.request, urllib.parse

UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Safari/537.36'
HDR = {'User-Agent': UA, 'Accept-Language': 'ja,en;q=0.8', 'Cookie': 'PREF=hl=ja&gl=JP; CONSENT=YES+cb'}

def get(url, data=None, headers=None):
    h = dict(HDR); h.update(headers or {})
    req = urllib.request.Request(url, data=data, headers=h)
    with urllib.request.urlopen(req, timeout=30) as r:
        return r.read().decode('utf-8', 'replace')

def walk(o, acc):
    if isinstance(o, dict):
        if 'videoRenderer' in o:
            v = o['videoRenderer']
            title = ''.join(r.get('text','') for r in v.get('title',{}).get('runs',[]))
            own = v.get('ownerText',{}).get('runs',[{}])[0]
            ch = own.get('text','')
            chid = own.get('navigationEndpoint',{}).get('browseEndpoint',{}).get('browseId','')
            vc = v.get('viewCountText',{})
            viewers = ''.join(r.get('text','') for r in vc.get('runs',[])) or vc.get('simpleText','')
            badges = json.dumps(v.get('badges',[]), ensure_ascii=False)
            acc.append({'id': v.get('videoId'), 'title': title, 'ch': ch, 'chId': chid, 'viewers': viewers.strip(), 'live': 'LIVE' in badges})
            return
        if 'continuationItemRenderer' in o:
            tok = o['continuationItemRenderer'].get('continuationEndpoint',{}).get('continuationCommand',{}).get('token')
            if tok: acc.append({'__cont': tok})
            return
        for k in o: walk(o[k], acc)
    elif isinstance(o, list):
        for x in o: walk(x, acc)

def search(q, pages=2):
    url = 'https://www.youtube.com/results?' + urllib.parse.urlencode({'search_query': q, 'sp': 'EgJAAQ%3D%3D', 'hl': 'ja', 'gl': 'JP'})
    html = get(url)
    m = re.search(r'var ytInitialData = (\{.*?\});</script>', html, re.S)
    if not m:
        return [], 'no ytInitialData (len=%d)' % len(html)
    data = json.loads(m[1])
    key = re.search(r'"INNERTUBE_API_KEY":"([^"]+)"', html)
    ver = re.search(r'"INNERTUBE_CLIENT_VERSION":"([^"]+)"', html)
    acc = []; walk(data, acc)
    items = [x for x in acc if 'id' in x]
    conts = [x['__cont'] for x in acc if '__cont' in x]
    page = 1
    while conts and page < pages and key and ver:
        tok = conts[-1]
        body = json.dumps({'context': {'client': {'clientName': 'WEB', 'clientVersion': ver[1], 'hl': 'ja', 'gl': 'JP'}}, 'continuation': tok}).encode()
        try:
            resp = get('https://www.youtube.com/youtubei/v1/search?key=%s&prettyPrint=false' % key[1], data=body, headers={'Content-Type': 'application/json', 'X-Youtube-Client-Name': '1', 'X-Youtube-Client-Version': ver[1]})
        except Exception as e:
            return items, 'cont error: %s' % e
        acc = []; walk(json.loads(resp), acc)
        items += [x for x in acc if 'id' in x]
        conts = [x['__cont'] for x in acc if '__cont' in x]
        page += 1
        time.sleep(0.3)
    return items, None

if __name__ == '__main__':
    queries = [l.strip() for l in open(sys.argv[1], encoding='utf-8') if l.strip()]
    pages = int(sys.argv[2]) if len(sys.argv) > 2 else 2
    out = open(sys.argv[3] if len(sys.argv) > 3 else 'raw.jsonl', 'a', encoding='utf-8')
    for q in queries:
        try:
            items, err = search(q, pages)
        except Exception as e:
            items, err = [], str(e)
        print(f'{q}\t{len(items)}\t{err or ""}', flush=True)
        for it in items:
            it['q'] = q
            out.write(json.dumps(it, ensure_ascii=False) + '\n')
        time.sleep(0.5)
