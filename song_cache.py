"""Ever-growing local archive of every song seen during sync passes.

SQLite (stdlib) rather than pickle: incremental appends instead of rewriting a
blob, survives a crash mid-write, and stays inspectable
(`sqlite3 song_cache.db "SELECT name, artist, last_seen FROM songs"`).
Rows are only ever inserted or refreshed, never deleted — tracks that later
vanish from every playlist remain archived with their full metadata.
"""

import json
import sqlite3
from datetime import datetime, timezone

SCHEMAS = [
    """
CREATE TABLE IF NOT EXISTS songs (
    source      TEXT NOT NULL,
    id          TEXT NOT NULL,
    isrc        TEXT,
    name        TEXT,
    artist      TEXT,
    album       TEXT,
    duration_ms INTEGER,
    meta        TEXT,
    first_seen  TEXT NOT NULL,
    last_seen   TEXT NOT NULL,
    PRIMARY KEY (source, id)
)
""",
    """
CREATE TABLE IF NOT EXISTS links (
    spotify_id TEXT NOT NULL,
    target     TEXT NOT NULL,
    target_id  TEXT NOT NULL,
    updated    TEXT NOT NULL,
    PRIMARY KEY (spotify_id, target)
)
""",
    """
CREATE TABLE IF NOT EXISTS sync_state (
    pair         TEXT NOT NULL,
    target       TEXT NOT NULL,
    snapshot_id  TEXT,
    target_count INTEGER,
    updated      TEXT NOT NULL,
    PRIMARY KEY (pair, target)
)
""",
]

UPSERT = """
INSERT INTO songs (source, id, isrc, name, artist, album, duration_ms, meta, first_seen, last_seen)
VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
ON CONFLICT(source, id) DO UPDATE SET
    isrc = excluded.isrc,
    name = excluded.name,
    artist = excluded.artist,
    album = excluded.album,
    duration_ms = excluded.duration_ms,
    meta = excluded.meta,
    last_seen = excluded.last_seen
"""


def connect(path):
    # check_same_thread=False: each mirror thread holds its own connection or
    # sole use of one; the generous timeout rides out cross-connection locks.
    conn = sqlite3.connect(path, timeout=30, check_same_thread=False)
    for schema in SCHEMAS:
        conn.execute(schema)
    conn.commit()
    return conn


def _now():
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def get_links(conn, target, spotify_ids):
    """{spotify_id: target_id} for previously matched tracks — hard identifier
    mapping, checked before any ISRC or search resolution."""
    out = {}
    ids = [i for i in spotify_ids if i]
    for i in range(0, len(ids), 500):
        chunk = ids[i : i + 500]
        marks = ",".join("?" * len(chunk))
        rows = conn.execute(
            f"SELECT spotify_id, target_id FROM links WHERE target = ? AND spotify_id IN ({marks})",
            [target, *chunk],
        )
        out.update(dict(rows.fetchall()))
    return out


def set_links(conn, target, mapping):
    # ponytail: links are trusted forever; if a linked id goes stale (region
    # pull), delete its row from the links table to force re-resolution.
    rows = [(sid, target, tid, _now()) for sid, tid in mapping.items() if sid and tid]
    if rows:
        conn.executemany("INSERT OR REPLACE INTO links VALUES (?, ?, ?, ?)", rows)
        conn.commit()


def get_state(conn, pair, target):
    row = conn.execute(
        "SELECT snapshot_id, target_count FROM sync_state WHERE pair = ? AND target = ?", (pair, target)
    ).fetchone()
    return row  # (snapshot_id, target_count) or None


def set_state(conn, pair, target, snapshot_id, target_count):
    conn.execute(
        "INSERT OR REPLACE INTO sync_state VALUES (?, ?, ?, ?, ?)",
        (pair, target, snapshot_id, target_count, _now()),
    )
    conn.commit()


def upsert_many(conn, source, tracks):
    """Archive the sync's own snapshot dicts (Spotify or Apple shape).
    first_seen is preserved on refresh; meta keeps the full snapshot as JSON."""
    now = datetime.now(timezone.utc).isoformat(timespec="seconds")
    rows = []
    for track in tracks:
        song_id = track.get("id") or track.get("catalog_id") or track.get("relationship_id")
        if not song_id:
            continue
        artist = track.get("artist") or ", ".join(track.get("artists") or [])
        rows.append(
            (
                source,
                song_id,
                track.get("isrc"),
                track.get("name"),
                artist,
                track.get("album"),
                track.get("duration_ms"),
                json.dumps(track, ensure_ascii=False),
                now,
                now,
            )
        )
    if rows:
        conn.executemany(UPSERT, rows)
        conn.commit()
    return len(rows)
