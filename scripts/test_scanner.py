"""Offline contract tests for the Twitch scanner. Run: python -m unittest discover -s scripts -v"""
import importlib.util
import unittest
from pathlib import Path
from unittest.mock import patch

module_path = Path(__file__).with_name('scan_twitch.py')
spec = importlib.util.spec_from_file_location('scan_twitch', module_path)
scanner = importlib.util.module_from_spec(spec)
spec.loader.exec_module(scanner)


class FakeTwitch:
    def __init__(self):
        pass

    def get(self, route, **args):
        if route == 'games':
            return [{'id': 'GTAVI123', 'name': 'Grand Theft Auto VI'}]
        if route == 'users':
            return [{'login': 'caseoh_', 'id': 'S1'}]
        if route == 'clips' and 'game_id' in args:
            return [dict(id='aaa', url='https://clips.twitch.tv/aaa', view_count=300, game_id='GTAVI123',
                         broadcaster_name='CaseOh')]
        if route == 'clips' and 'broadcaster_id' in args:
            return [dict(id='aaa', url='https://clips.twitch.tv/aaa', view_count=320, game_id='GTAVI123',
                         broadcaster_name='CaseOh'),
                    dict(id='othergame', url='https://clips.twitch.tv/othergame', view_count=9000,
                         game_id='GTA5', broadcaster_name='CaseOh')]
        raise AssertionError((route, args))


class ScannerContractTests(unittest.TestCase):
    def test_scan_dedupes_and_filters_other_games(self):
        with patch.object(scanner, 'Twitch', FakeTwitch), patch.object(scanner, 'read_watchlist', lambda: ['caseoh_']):
            clips, info = scanner.scan()
        self.assertEqual(info['status'], 'ok')
        self.assertEqual(len(clips), 1)
        self.assertEqual(clips[0]['id'], 'aaa')
        self.assertEqual(clips[0]['view_count'], 320)
        self.assertEqual(clips[0]['discovery_sources'], [
            'Twitch category · 48 hours', 'Twitch category · recent', 'Creator watchlist · caseoh_'
        ])
        self.assertEqual(info['watchlistChecked'], 1)

    def test_unknown_category_is_reported_not_faked(self):
        class Missing(FakeTwitch):
            def get(self, route, **args):
                return []
        with patch.object(scanner, 'Twitch', Missing):
            clips, info = scanner.scan()
        self.assertEqual(clips, [])
        self.assertEqual(info['status'], 'category_unavailable')


if __name__ == '__main__':
    unittest.main()
