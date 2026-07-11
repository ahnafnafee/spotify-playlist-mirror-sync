"""Offline self-check for local_mirror.py: `uv run python test_local_mirror.py`."""

import os
import tempfile
import types
from datetime import datetime, timezone
from pathlib import Path

import local_mirror as lm


class FakeSp:
    def __init__(self, items):
        self._items = items

    def playlist_items(self, playlist_id, additional_types=("track",), limit=100):
        return {"items": self._items, "next": None}

    def next(self, page):
        raise AssertionError("no pagination expected in test")


def fake_item(name, artists, isrc, added_at):
    return {
        "added_at": added_at,
        "track": {
            "name": name,
            "is_local": False,
            "external_ids": {"isrc": isrc} if isrc else {},
            "artists": [{"name": a} for a in artists],
        },
    }


def test_norm_and_sanitize():
    assert lm._norm(" The-Track  Name! ") == "the track name"
    assert lm._norm(None) == ""
    cleaned = lm.sanitize_folder('A/B: C*?')
    assert not (set('<>:"/\\|?*') & set(cleaned)) and cleaned
    assert lm.sanitize_folder("...") == "playlist"
    assert lm.sanitize_folder(None) == "playlist"


def test_track_index_and_matcher():
    when_a = "2024-01-05T10:00:00Z"
    when_b = "2024-03-09T20:30:00Z"
    sp = FakeSp(
        [
            fake_item("Song One", ["Alpha", "Beta"], "USUM71900001", when_a),
            fake_item("Song Two", ["Gamma"], None, when_b),
            {"added_at": None, "track": {"name": "skipped"}},  # no added_at -> ignored
            {  # current Web API shape: payload under "item"
                "added_at": "2024-05-01T00:00:00Z",
                "item": {"type": "track", "name": "Song Three", "artists": [{"name": "Delta"}], "external_ids": {}},
            },
        ]
    )
    by_isrc, by_key = lm.spotify_track_index(sp, "pl1")
    assert "delta|song three" in by_key

    assert by_isrc["USUM71900001"] == datetime(2024, 1, 5, 10, 0, tzinfo=timezone.utc)
    assert "alpha|song one" in by_key and "alpha beta|song one" in by_key
    assert "gamma|song two" in by_key

    # ISRC wins even with garbage title/artist.
    hit = lm.match_added_at(["usum71900001 "], "???", [], by_isrc, by_key)
    assert hit == by_isrc["USUM71900001"]
    # Tag frame with joined artists "Alpha, Beta" matches via first-artist split.
    hit = lm.match_added_at([], "Song One", ["Alpha, Beta"], by_isrc, by_key)
    assert hit == by_isrc["USUM71900001"]
    # Plain single-artist match.
    hit = lm.match_added_at([], "Song Two", ["Gamma"], by_isrc, by_key)
    assert hit == datetime(2024, 3, 9, 20, 30, tzinfo=timezone.utc)
    # Miss returns None.
    assert lm.match_added_at([], "Unknown", ["Nobody"], by_isrc, by_key) is None


def test_stamp_mtimes():
    when = datetime(2023, 6, 1, 12, 0, tzinfo=timezone.utc)
    with tempfile.TemporaryDirectory() as tmp:
        folder = Path(tmp)
        (folder / "a.mp3").write_bytes(b"x")
        (folder / "b.mp3").write_bytes(b"x")
        (folder / "notes.txt").write_bytes(b"x")
        txt_mtime = (folder / "notes.txt").stat().st_mtime

        real = lm.file_added_at
        lm.file_added_at = lambda p, i, k: when if p.name == "a.mp3" else None
        try:
            stamped, unmatched = lm.stamp_mtimes(folder, {}, {})
        finally:
            lm.file_added_at = real

        assert (stamped, unmatched) == (1, 1)
        assert abs((folder / "a.mp3").stat().st_mtime - when.timestamp()) < 1
        assert (folder / "notes.txt").stat().st_mtime == txt_mtime


def test_build_sync_cmd():
    with tempfile.TemporaryDirectory() as tmp:
        folder = Path(tmp)
        save = folder / ".sync.spotdl"
        url = "https://open.spotify.com/playlist/abc"

        cmd = lm.build_sync_cmd(folder, save, url)
        assert url in cmd and "--save-file" in cmd and "sync" in cmd

        save.write_text("{}")
        os.environ["LOCAL_MIRROR_FORMAT"] = "flac"
        try:
            cmd = lm.build_sync_cmd(folder, save, url)
        finally:
            del os.environ["LOCAL_MIRROR_FORMAT"]
        assert str(save) in cmd and "--save-file" not in cmd and url not in cmd
        assert cmd[cmd.index("--format") + 1] == "flac"


def test_run_never_raises_and_skips():
    real = lm.importlib.util.find_spec
    lm.importlib.util.find_spec = lambda name: None  # force "spotdl missing"
    try:
        lm.run(None, [{"id": "x", "name": "X"}], tempfile.mkdtemp())
    finally:
        lm.importlib.util.find_spec = real


def test_run_full_path_and_name_collision():
    calls = []
    real = (lm.importlib.util.find_spec, lm.ffmpeg_available, lm._sync_one)
    lm.importlib.util.find_spec = lambda name: object()
    lm.ffmpeg_available = lambda: True
    lm._sync_one = lambda sp, pl, folder, t: calls.append(folder.name)
    try:
        with tempfile.TemporaryDirectory() as tmp:
            lm.run(
                None,
                [
                    {"id": "id111111aaaa", "name": "Mix"},
                    {"id": "id222222bbbb", "name": "Mix"},  # same name -> distinct folder
                    {"id": "id333333cccc", "name": "Chill"},
                ],
                tmp,
            )
    finally:
        lm.importlib.util.find_spec, lm.ffmpeg_available, lm._sync_one = real

    assert calls[0] == "Mix"
    assert calls[1] == "Mix [id222222]"
    assert calls[2] == "Chill"


def test_sync_one_failure_logs_not_stamps():
    real_run = lm.subprocess.run
    real_index = lm.spotify_track_index
    lm.subprocess.run = lambda *a, **k: types.SimpleNamespace(returncode=1, stderr="boom", stdout="")
    lm.spotify_track_index = lambda *a: (_ for _ in ()).throw(AssertionError("must not fetch on failure"))
    try:
        with tempfile.TemporaryDirectory() as tmp:
            lm._sync_one(None, {"id": "p", "name": "P"}, Path(tmp) / "P", 5)
    finally:
        lm.subprocess.run = real_run
        lm.spotify_track_index = real_index


if __name__ == "__main__":
    for fn in sorted(k for k in dir() if k.startswith("test_")):
        globals()[fn]()
        print(f"ok {fn}")
    print("all local_mirror checks passed")
