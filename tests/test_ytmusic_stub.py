"""YT browser-session lifetime: keep it rotated, and never let an expired one
read as "no playlists / empty playlist"."""

import json

import pytest

from songmirror.engine.targets import ytmusic
from songmirror.engine.targets.base import TargetAuthError
from songmirror.engine.targets.ytmusic import YTMusicBrowserTarget, _expired, rotate_browser_cookie


def _auth_file(tmp_path, ts="old"):
    p = tmp_path / "browser.json"
    p.write_text(json.dumps({"user-agent": "UA",
                             "cookie": f"SAPISID=sign; __Secure-1PSIDTS={ts}; PREF=f6=4&tz=UTC"}))
    return p


def _fake_post(status, issued):
    class R:
        status_code = status
        cookies = type("C", (), {"get_dict": lambda self: issued})()
    return lambda *a, **k: R()


def test_rotation_writes_the_new_cookie(tmp_path, monkeypatch):
    p = _auth_file(tmp_path)
    monkeypatch.setattr(ytmusic.requests, "post", _fake_post(200, {"__Secure-1PSIDTS": "new"}))
    assert rotate_browser_cookie(str(p)) is True
    cookie = json.loads(p.read_text())["cookie"]
    assert "__Secure-1PSIDTS=new" in cookie
    assert "SAPISID=sign" in cookie and "PREF=f6=4&tz=UTC" in cookie  # rest of the session intact


def test_rate_limited_rotation_leaves_the_working_cookie_alone(tmp_path, monkeypatch):
    p = _auth_file(tmp_path)
    before = p.read_text()
    monkeypatch.setattr(ytmusic.requests, "post", _fake_post(429, {}))
    assert rotate_browser_cookie(str(p)) is False
    assert p.read_text() == before


def test_unchanged_value_is_not_a_rotation(tmp_path, monkeypatch):
    p = _auth_file(tmp_path)
    monkeypatch.setattr(ytmusic.requests, "post", _fake_post(200, {"__Secure-1PSIDTS": "old"}))
    assert rotate_browser_cookie(str(p)) is False


def test_network_failure_is_survivable(tmp_path, monkeypatch):
    p = _auth_file(tmp_path)
    before = p.read_text()

    def boom(*a, **k):
        raise ytmusic.requests.RequestException("offline")

    monkeypatch.setattr(ytmusic.requests, "post", boom)
    assert rotate_browser_cookie(str(p)) is False  # a pass must still run on the stored cookie
    assert p.read_text() == before


def test_logged_out_keyerror_becomes_an_auth_error():
    assert _expired(lambda: ["ok"], "x") == ["ok"]
    with pytest.raises(TargetAuthError, match="session expired"):
        # what ytmusicapi's nav() raises when the response has no 'contents'
        _expired(lambda: (_ for _ in ()).throw(KeyError("contents")), "x")


def _target(library, alive):
    t = YTMusicBrowserTarget.__new__(YTMusicBrowserTarget)  # skip the network-touching __init__
    t._api = type("A", (), {
        "get_library_playlists": lambda self, limit=None: library,
        "get_account_info": lambda self: {"accountName": "me"} if alive else {},
    })()
    return t


def test_empty_library_on_dead_session_is_fatal_not_empty():
    # Returning {} here would make the runner recreate every playlist.
    with pytest.raises(TargetAuthError):
        _target([], alive=False).list_playlists()


def test_empty_library_on_live_session_is_honest():
    assert _target([], alive=True).list_playlists() == {}


def test_library_maps_by_casefolded_title():
    got = _target([{"title": "Chai & Chill", "playlistId": "p1", "count": 3}], alive=True).list_playlists()
    assert got["chai & chill"]["playlistId"] == "p1"
