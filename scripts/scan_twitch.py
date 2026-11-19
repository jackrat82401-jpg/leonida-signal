#!/usr/bin/env python3
"""Fetch public GTA VI clip metadata for GitHub Pages, without exposing secrets.

Only public metadata is published. Rights, notes and editing decisions live in a
browser's localStorage, not in the generated JSON.
"""
from __future__ import annotations
import json
import os
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path
from urllib.parse import urlencode
from urllib.request import Request, urlopen
from urllib.error import HTTPError, URLError

ROOT = Path(__file__).resolve().parent.parent
FEED = ROOT / 'data' / 'latest.json'
WATCHLIST = ROOT / 'config' / 'watchlist.json'
CLIENT_ID = os.getenv('TWITCH_CLIENT_ID', '').strip()
CLIENT_SECRET = os.getenv('TWITCH_CLIENT_SECRET', '').strip()
USER_AGENT = 'LeonidaSignalPublicFeed/1.1'


def utc_now():
    return datetime.now(timezone.utc)


def stamp(dt):
    return dt.isoformat(timespec='seconds').replace('+00:00', 'Z')


def request_json(url, headers=None, data=None):
    req = Request(url, headers={'User-Agent': USER_AGENT, **(headers or {})}, data=data)
    try:
        with urlopen(req, timeout=25) as resp:
            return json.load(resp)
    except HTTPError as e:
        # Avoid printing entire upstream bodies, because tokens/credentials may appear.
        raise RuntimeError(f'Twitch returned HTTP {e.code}') from e
    except URLError as e:
        raise RuntimeError('Twitch network request failed') from e


class Twitch:
    def __init__(self):
        if not CLIENT_ID or not CLIENT_SECRET:
            raise RuntimeError('Missing Twitch app credentials')
        body = urlencode({'client_id': CLIENT_ID, 'client_secret': CLIENT_SECRET,
                          'grant_type': 'client_credentials'}).encode()
        auth = request_json('https://id.twitch.tv/oauth2/token',
                            {'Content-Type': 'application/x-www-form-urlencoded'}, body)
        self.headers = {'Client-Id': CLIENT_ID, 'Authorization': 'Bearer ' + auth['access_token']}

    def get(self, endpoint, **params):
        return request_json('https://api.twitch.tv/helix/' + endpoint + '?' + urlencode(params, doseq=True), self.headers).get('data', [])


def read_watchlist():
    raw = json.loads(WATCHLIST.read_text(encoding='utf-8'))
    result = []
    for handle in raw.get('handles', []):
        if not isinstance(handle, str):
            continue
        handle = handle.strip().lower().removeprefix('@')
        if handle and handle.replace('_', '').isalnum() and handle not in result:
            result.append(handle)
    return result[:30]


def scan():
    api = Twitch()
    categories = api.get('games', name='Grand Theft Auto VI')
    game = next((g for g in categories if g.get('name', '').lower() == 'grand theft auto vi'), None)
    if not game:
        return [], {'status': 'category_unavailable', 'message': 'Exact GTA VI Twitch category is not yet available', 'gameId': None}
    game_id = game['id']
    end = utc_now()
    start_iso = stamp(end - timedelta(hours=48))
    end_iso = stamp(end)

    # Get top clips for the game and extra results for configured creators.
    clips = api.get('clips', game_id=game_id, started_at=start_iso, ended_at=end_iso, first=100)
    handles = read_watchlist()
    if handles:
        for i in range(0, len(handles), 100):
            users = api.get('users', login=handles[i:i + 100])
            for user in users:
                personal = api.get('clips', broadcaster_id=user['id'],
                                   started_at=start_iso, ended_at=end_iso, first=15)
                # Broadcaster clips can cover other games; only keep GTA VI.
                clips.extend(c for c in personal if str(c.get('game_id', '')) == str(game_id))

    dedup = {}
    for c in clips:
        if not c.get('id') or not str(c.get('url', '')).startswith('https://'):
            continue
        clip_id = c['id']
        if clip_id not in dedup or int(c.get('view_count') or 0) > int(dedup[clip_id].get('view_count') or 0):
            dedup[clip_id] = c
    ranked = sorted(dedup.values(), key=lambda c: int(c.get('view_count') or 0), reverse=True)[:150]
    safe = [{k: c.get(k) for k in ('id', 'url', 'title', 'broadcaster_name', 'creator_name',
                                  'view_count', 'created_at', 'duration', 'thumbnail_url',
                                  'game_id', 'broadcaster_id')} for c in ranked]
    return safe, {'status': 'ok', 'message': 'Fetched public Twitch clip metadata',
                  'gameId': str(game_id), 'watchlistChecked': len(handles)}


def main():
    existing = json.loads(FEED.read_text(encoding='utf-8')) if FEED.exists() else {}
    if not CLIENT_ID or not CLIENT_SECRET:
        existing.update({'status': 'setup_required',
                         'message': 'Add TWITCH_CLIENT_ID and TWITCH_CLIENT_SECRET in GitHub Actions secrets, then run this workflow.'})
        FEED.write_text(json.dumps(existing, indent=2, ensure_ascii=False) + '\n', encoding='utf-8')
        print('No Twitch credentials: deployed starter feed without contacting Twitch.')
        return
    try:
        clips, summary = scan()
        output = {'status': summary.pop('status'), 'message': summary.pop('message'),
                  'generatedAt': stamp(utc_now()), 'game': 'Grand Theft Auto VI',
                  'source': 'Twitch official Helix API', 'clips': clips, **summary}
        FEED.write_text(json.dumps(output, indent=2, ensure_ascii=False) + '\n', encoding='utf-8')
        print(f"Twitch scan: {len(clips)} unique GTA VI clips, status={output['status']}")
    except Exception as exc:
        # Preserve previous published leads when upstream is unavailable.
        output = {**existing, 'status': 'scan_error', 'message': str(exc),
                  'attemptedAt': stamp(utc_now())}
        FEED.write_text(json.dumps(output, indent=2, ensure_ascii=False) + '\n', encoding='utf-8')
        print(f'Scan unsuccessful: {type(exc).__name__}.', file=sys.stderr)


if __name__ == '__main__':
    main()
