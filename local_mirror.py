"""Local audio mirror of the synced Spotify playlists via spotDL.

One subfolder per playlist under the download dir. spotDL's native `sync`
downloads newly added tracks and deletes ones removed from the playlist.
After each sync, every audio file's mtime is set to that track's Spotify
added_at so sorting by Date Modified equals date-added order (newest last).
"""

import importlib.util
import os
import re
import shutil
import subprocess
import sys
from datetime import datetime
from pathlib import Path

from main import normalize_text as _norm  # Unicode-aware, shared with the sync
from main import playlist_item_track

AUDIO_EXTS = {".mp3", ".flac", ".ogg", ".opus", ".m4a", ".wav"}
# ponytail: one blunt per-playlist timeout - a killed first run just resumes next pass
DEFAULT_TIMEOUT_S = 3600


def _log(message):
    print(f"[{datetime.now():%H:%M:%S}] {message}", flush=True)


def sanitize_folder(name):
    cleaned = re.sub(r'[<>:"/\\|?*\x00-\x1f]', "_", name or "").strip().rstrip(" .")
    return cleaned or "playlist"


def ffmpeg_available():
    if shutil.which("ffmpeg"):
        return True
    return (Path.home() / ".spotdl" / ("ffmpeg.exe" if os.name == "nt" else "ffmpeg")).is_file()


def spotify_track_index(sp, playlist_id):
    """Two lookups from the live playlist: {ISRC: added_at} and {'artist|title': added_at}."""
    by_isrc, by_key = {}, {}
    page = sp.playlist_items(playlist_id, additional_types=("track",), limit=100)
    while page:
        for item in page.get("items", []):
            track = playlist_item_track(item)
            added = item.get("added_at")
            if not added or not track:
                continue
            try:
                when = datetime.fromisoformat(added.replace("Z", "+00:00"))
            except ValueError:
                continue
            isrc = (track.get("external_ids") or {}).get("isrc")
            if isrc:
                by_isrc[isrc.strip().upper()] = when
            title = _norm(track.get("name"))
            artists = [a.get("name", "") for a in track.get("artists", []) if a.get("name")]
            if title:
                for artist in {_norm(artists[0] if artists else ""), _norm(" ".join(artists))}:
                    if artist:
                        by_key[f"{artist}|{title}"] = when
        page = sp.next(page) if page.get("next") else None
    return by_isrc, by_key


def match_added_at(isrcs, title, raw_artists, by_isrc, by_key):
    """Exact ISRC match first, then normalized artist|title (handles joined artist frames)."""
    for isrc in isrcs:
        when = by_isrc.get(str(isrc).strip().upper())
        if when:
            return when
    title = _norm(title)
    if not title:
        return None
    for raw in raw_artists:
        for artist in (_norm(raw), _norm(re.split(r"[,;/]", raw)[0])):
            when = by_key.get(f"{artist}|{title}")
            if when:
                return when
    return None


def file_added_at(path, by_isrc, by_key):
    """Match via embedded tags - tags beat re-deriving spotDL's sanitized
    filenames, which drift across spotDL versions."""
    import mutagen  # spotDL dependency, present whenever spotdl is installed

    audio = mutagen.File(path, easy=True)
    if not audio:
        return None
    return match_added_at(
        audio.get("isrc") or [],
        (audio.get("title") or [""])[0],
        audio.get("artist") or [],
        by_isrc,
        by_key,
    )


def stamp_mtimes(folder, by_isrc, by_key):
    stamped = unmatched = 0
    for path in sorted(folder.rglob("*")):
        if not path.is_file() or path.suffix.lower() not in AUDIO_EXTS:
            continue
        try:
            when = file_added_at(path, by_isrc, by_key)
        except Exception:
            when = None
        if when:
            ts = when.timestamp()
            os.utime(path, (ts, ts))
            stamped += 1
        else:
            unmatched += 1
    return stamped, unmatched


def build_sync_cmd(folder, save_file, playlist_url):
    cmd = [sys.executable, "-m", "spotdl", "sync"]
    cmd.append(str(save_file) if save_file.exists() else playlist_url)
    if not save_file.exists():
        cmd += ["--save-file", str(save_file)]
    # Same --output every run: sync's delete step recomputes old paths from it.
    # AlbumArtist/Album nesting is Jellyfin's canonical music layout. The m3u8
    # is named after the playlist (Jellyfin uses the filename as the playlist
    # name) and both paths are relative to the playlist folder (cwd), so the
    # m3u entries stay valid wherever the music root is mounted.
    cmd += [
        "--output", "{album-artist}/{album}/{artists} - {title}.{output-ext}",
        "--m3u", f"{folder.name}.m3u8",
        "--simple-tui",
    ]
    client_id, client_secret = os.getenv("SPOTIFY_CLIENT_ID"), os.getenv("SPOTIFY_CLIENT_SECRET")
    if client_id and client_secret:
        cmd += ["--client-id", client_id, "--client-secret", client_secret]
    audio_format = os.getenv("LOCAL_MIRROR_FORMAT")
    if audio_format:
        cmd += ["--format", audio_format]
    return cmd


def _sync_one(sp, playlist, folder, timeout_s):
    name = playlist.get("name") or playlist["id"]
    folder.mkdir(parents=True, exist_ok=True)
    save_file = folder / ".sync.spotdl"  # spotdl requires the .spotdl extension
    url = (playlist.get("external_urls") or {}).get("spotify") or (
        f"https://open.spotify.com/playlist/{playlist['id']}"
    )

    proc = subprocess.run(
        build_sync_cmd(folder, save_file, url),
        capture_output=True,
        text=True,
        timeout=timeout_s,
        cwd=str(folder),
    )
    if proc.returncode != 0:
        tail = " ".join(((proc.stderr or "") + " " + (proc.stdout or "")).split())[-300:]
        _log(f"  local mirror: '{name}' spotdl exit {proc.returncode}: {tail}")
        return

    by_isrc, by_key = spotify_track_index(sp, playlist["id"])
    stamped, unmatched = stamp_mtimes(folder, by_isrc, by_key)
    _log(f"  local mirror: '{name}' synced ({stamped} files date-stamped, {unmatched} unmatched)")


def run(sp, spotify_playlists, download_dir):
    """sp: authenticated spotipy.Spotify (read scopes).
    spotify_playlists: list of Spotify playlist dicts (have 'id', 'name', 'external_urls').
    download_dir: base folder path (str)."""
    try:
        if importlib.util.find_spec("spotdl") is None:
            _log("local mirror skipped: spotdl not installed (uv sync --extra download)")
            return
        if not ffmpeg_available():
            _log("local mirror skipped: ffmpeg not found (install it or run `spotdl --download-ffmpeg`)")
            return

        base = Path(download_dir)
        base.mkdir(parents=True, exist_ok=True)
        timeout_s = int(os.getenv("LOCAL_MIRROR_TIMEOUT", DEFAULT_TIMEOUT_S))

        used_names = set()
        for playlist in spotify_playlists:
            name = playlist.get("name") or playlist.get("id", "playlist")
            folder_name = sanitize_folder(name)
            if folder_name.lower() in used_names:  # same-named playlists must not share a sync file
                folder_name = f"{folder_name} [{str(playlist.get('id', ''))[:8]}]"
            used_names.add(folder_name.lower())
            try:
                _sync_one(sp, playlist, base / folder_name, timeout_s)
            except Exception as e:  # the mirror must never break the main sync pass
                _log(f"  local mirror: '{name}' failed: {e}")
    except Exception as e:
        _log(f"local mirror failed: {e}")
