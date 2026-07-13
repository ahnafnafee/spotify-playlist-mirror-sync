"""YouTube Music target — via the official YouTube Data API v3.

Durable OAuth (refresh-token) auth. ytmusicapi's internal youtubei endpoints
reject self-created OAuth clients (HTTP 400) and its captured browser cookies
die within a day, so neither survives an unattended loop. The Data API shares
YouTube's playlist/video namespace — its writes surface in the YouTube Music
app — at the cost of a 10k-unit/day quota (search=100, insert/delete=50,
list=1) and no ISRC, so matching stays title/artist/duration, biased toward
`- Topic` art-tracks so resolved tracks land as native songs, not videos.

Setup: create a Google "TVs and Limited Input devices" OAuth client, then
    uvx ytmusicapi oauth --file data/ytmusic_oauth.json \
        --client-id <ID> --client-secret <SECRET>
and set YTMUSIC_OAUTH_CLIENT_ID / YTMUSIC_OAUTH_CLIENT_SECRET.
"""

import json
import os
import random
import re
import time

import requests

from ..config import REQUEST_TIMEOUT, polite_sleep
from ..logs import log, log_note, log_warn
from ..matching import normalize_text, romanized, score_candidate, track_key
from .base import MirrorTarget, TargetAuthError

DEFAULT_AUTH_FILE = "ytmusic_oauth.json"
API = "https://www.googleapis.com/youtube/v3"

_ISO_DUR = re.compile(r"PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?")
_TOPIC_RE = re.compile(r"\s*-\s*Topic$")
# YouTube video titles embed artist + decoration ("Queen – Bohemian Rhapsody
# (Official Video)"); art-track titles are already clean. Strip [..]/(..) that
# carry decoration keywords, but NOT version parens like (Live)/(Acoustic) — the
# scorer must still treat those as distinct recordings.
_YT_DECOR = re.compile(
    r"\[[^\]]*\]"
    r"|\((?=[^)]*\b(?:official|video|audio|lyric|lyrics|visuali[sz]er|hd|4k|mv|remaster)\b)[^)]*\)"
    r"|\bofficial\s+(?:music\s+)?video\b"
    r"|\bremaster(?:ed)?(?:\s+\d{4})?\b",
    re.IGNORECASE)


def build():
    """A ready YTMusicTarget, or None (logged) when YT isn't set up."""
    auth = os.getenv("YTMUSIC_AUTH_FILE", DEFAULT_AUTH_FILE)
    cid, secret = os.getenv("YTMUSIC_OAUTH_CLIENT_ID"), os.getenv("YTMUSIC_OAUTH_CLIENT_SECRET")
    if not os.path.exists(auth):
        log_note(f"YouTube Music skipped: no OAuth token '{auth}' (create with: "
                 "uvx ytmusicapi oauth --file data/ytmusic_oauth.json --client-id ... --client-secret ...)", tag="yt")
        return None
    if not (cid and secret):
        log_note("YouTube Music skipped: set YTMUSIC_OAUTH_CLIENT_ID and YTMUSIC_OAUTH_CLIENT_SECRET", tag="yt")
        return None
    try:
        from ytmusicapi.auth.oauth import OAuthCredentials
    except ImportError:
        log_note("YouTube Music skipped: ytmusicapi not installed (used only to refresh the OAuth token)", tag="yt")
        return None
    try:
        return YTMusicTarget(auth, OAuthCredentials(client_id=cid, client_secret=secret))
    except Exception as e:
        log_warn(f"YouTube Music unavailable (re-run the ytmusicapi oauth setup?): {e!r}", tag="yt")
        return None


def _parse_count(value):
    try:
        return int(str(value).replace(",", ""))
    except (TypeError, ValueError):
        return None


def _duration_ms(iso):
    """contentDetails.duration (ISO-8601, e.g. PT3M20S) -> ms, or None."""
    m = _ISO_DUR.fullmatch(iso or "")
    if not m:
        return None
    h, mnt, s = (int(x) if x else 0 for x in m.groups())
    return (h * 3600 + mnt * 60 + s) * 1000


def _artist_from_channel(channel):
    """'The Cranberries - Topic' -> 'The Cranberries'; VEVO/plain kept as-is."""
    return _TOPIC_RE.sub("", channel or "").strip()


def _clean_title(title, artists):
    """Strip a leading '<artist> -' and video-decoration parentheticals from a
    YouTube title so the fuzzy scorer sees ~the song name. Version tags like
    (Live)/(Acoustic) survive — they mark a genuinely different recording."""
    cleaned = _YT_DECOR.sub(" ", title or "")
    for artist in artists:
        if artist.strip():
            cleaned = re.sub(rf"^\s*{re.escape(artist.strip())}\s*[-–—:]\s*", "", cleaned, count=1, flags=re.IGNORECASE)
    return " ".join(cleaned.split()).strip() or (title or "")


def _err_reason(response):
    try:
        errors = response.json().get("error", {}).get("errors", [])
        return errors[0].get("reason", "") if errors else ""
    except ValueError:
        return ""


class YTMusicTarget(MirrorTarget):
    name = "YouTube Music"
    tag = "yt"
    source = "ytmusic"

    def __init__(self, auth_file, creds):
        self._auth_file = auth_file
        self._creds = creds
        with open(auth_file) as f:
            self._tok = json.load(f)
        self.cache_file = os.getenv("YTMUSIC_CACHE_FILE", "ytmusic_resolve_cache.json")
        self._session = requests.Session()
        self._rate_limited = False  # set once search hits the rate limit; defer the rest of the pass

    # -- auth ------------------------------------------------------------------
    def _access(self):
        """A valid access token, refreshed and persisted when near expiry. The
        refresh token is durable — this is the whole point of the Data API."""
        if time.time() >= self._tok.get("expires_at", 0) - 60:
            fresh = self._creds.refresh_token(self._tok["refresh_token"])
            fresh = fresh if isinstance(fresh, dict) else fresh.as_dict()
            self._tok.update(fresh)
            self._tok["expires_at"] = int(time.time()) + int(fresh.get("expires_in", 3600))
            with open(self._auth_file, "w") as f:
                json.dump(self._tok, f)
        return self._tok["access_token"]

    # -- HTTP ------------------------------------------------------------------
    def _request(self, method, path, *, params=None, json_body=None, ok404=False):
        """One Data API call. GET/5xx retry with backoff; 429 backs off on every
        method; 401 -> re-auth; 403 quota -> fail closed for the pass; other
        mutation failures are single-shot (a lost add/remove self-heals next pass,
        a blindly retried one could double-apply)."""
        attempts = 5
        for attempt in range(attempts):
            headers = {"Authorization": f"Bearer {self._access()}"}
            try:
                r = self._session.request(method, f"{API}/{path}", params=params,
                                          json=json_body, headers=headers, timeout=REQUEST_TIMEOUT)
            except requests.RequestException:
                if method == "GET" and attempt < attempts - 1:
                    time.sleep(min(2 ** attempt, 20) + random.uniform(0, 2))
                    continue
                raise
            if r.status_code == 401:
                raise TargetAuthError("YouTube rejected the OAuth token (401). Re-run the ytmusicapi oauth setup.")
            if r.status_code == 403:
                reason = _err_reason(r)
                if reason in ("quotaExceeded", "dailyLimitExceeded", "rateLimitExceeded"):
                    raise TargetAuthError(
                        f"YouTube Data API quota exhausted ({reason}); YT paused until the daily reset (~midnight PT).")
                raise TargetAuthError(f"YouTube refused {method} {path} (403 {reason or 'forbidden'}).")
            if r.status_code == 404 and ok404:
                return None
            if r.status_code == 429 and attempt < 1:
                # One short retry for a transient blip; a sustained limit (the
                # first-run backlog vs the daily quota) is handled by the caller
                # deferring the rest of the pass rather than fighting each track.
                wait = float(r.headers.get("Retry-After") or 8) + random.uniform(1, 4)
                log(f"  rate-limited by YouTube; waiting {int(wait)}s", tag=self.tag)
                time.sleep(wait)
                continue
            if r.status_code == 409 and attempt < attempts - 1:
                # Transient write-conflict the Data API throws on rapid playlist
                # edits; the write didn't apply, so a backed-off retry is safe.
                time.sleep(min(2 ** attempt, 15) + random.uniform(0, 2))
                continue
            if r.status_code >= 500 and method == "GET" and attempt < attempts - 1:
                time.sleep(min(2 ** attempt, 20) + random.uniform(0, 2))
                continue
            r.raise_for_status()
            return r
        return None

    def _paged(self, path, params):
        params = dict(params)
        while True:
            data = self._request("GET", path, params=params).json()
            yield from data.get("items", [])
            token = data.get("nextPageToken")
            if not token:
                return
            params["pageToken"] = token

    # -- MirrorTarget ----------------------------------------------------------
    def list_playlists(self):
        out = {}
        for pl in self._paged("playlists", {"part": "snippet,contentDetails", "mine": "true", "maxResults": 50}):
            title = (pl.get("snippet", {}).get("title") or "").strip()
            key = title.casefold()
            if key and key not in out:
                out[key] = {"playlistId": pl["id"], "title": title,
                            "count": pl.get("contentDetails", {}).get("itemCount")}
        return out

    def is_editable(self, playlist):
        return True  # mine=true only returns playlists we own

    def playlist_count(self, playlist):
        return _parse_count(playlist.get("count"))

    def create(self, sp_playlist):
        from .. import spotify

        body = {"snippet": {"title": sp_playlist.get("name", ""), "description": spotify.description(sp_playlist)},
                "status": {"privacyStatus": "private"}}
        pid = self._request("POST", "playlists", params={"part": "snippet,status"}, json_body=body).json()["id"]
        polite_sleep(2.0)  # let the new playlist settle before writing to it
        return {"playlistId": pid, "title": sp_playlist["name"], "count": 0}

    def playlist_tracks(self, playlist):
        tracks = []
        for item in self._paged("playlistItems", {
                "part": "snippet,contentDetails", "playlistId": playlist["playlistId"], "maxResults": 50}):
            vid = item.get("contentDetails", {}).get("videoId")
            if not vid:
                continue
            sn = item.get("snippet", {})
            artist = _artist_from_channel(sn.get("videoOwnerChannelTitle", ""))
            tracks.append({
                "id": vid, "videoId": vid, "playlistItemId": item.get("id"),
                "name": sn.get("title", ""), "artist": artist, "artists": [artist] if artist else [""],
                "album": None, "duration_ms": None,
            })
        return tracks

    def track_id(self, track):
        return track.get("videoId")

    def resolve(self, track, cache):
        primary = track["artists"][0] if track["artists"] else ""
        if not f"{track['name']} {primary}".strip():
            return None, None
        key = track_key(track["name"], " ".join(track["artists"]))
        if key in cache["search"]:
            return cache["search"][key], "search"
        best_id, method = self._search(track, primary)
        cache["search"][key] = best_id
        cache["dirty"] = True
        polite_sleep(0.5)
        return best_id, method

    def _search(self, track, primary):
        if self._rate_limited:
            return None, None  # already rate-limited this pass — don't pile on; resolve next pass
        queries = [f"{track['name']} {primary}".strip()]
        rom = f"{romanized(track['name'])} {romanized(primary)}".strip()
        if rom and rom != normalize_text(queries[0]):
            queries.append(rom)  # romanized retry only runs if the first query misses
        for query in queries:
            try:
                items = self._request("GET", "search", params={
                    "part": "snippet", "q": query, "type": "video",
                    "videoCategoryId": "10", "maxResults": 10}).json().get("items", [])
            except requests.HTTPError as e:
                if "429" not in str(e):
                    raise
                self._rate_limited = True  # daily quota / burst limit hit — stop searching this pass
                log_warn("YouTube search rate limit reached — deferring the rest of the resolves to the next "
                         "pass (raise the Data API quota to converge faster)", tag=self.tag)
                return None, None
            durations = self._durations([it["id"]["videoId"] for it in items if it.get("id", {}).get("videoId")])
            best = None  # (sort_key, videoId, is_topic)
            for it in items:
                vid = it.get("id", {}).get("videoId")
                if not vid:
                    continue
                sn = it.get("snippet", {})
                is_topic = bool(_TOPIC_RE.search(sn.get("channelTitle", "")))
                cand_name = sn.get("title", "") if is_topic else _clean_title(sn.get("title", ""), track["artists"])
                score, ok = score_candidate(track["name"], track["artists"], track["duration_ms"],
                                            cand_name, _artist_from_channel(sn.get("channelTitle", "")),
                                            durations.get(vid))
                if ok:
                    sort_key = score + (0.05 if is_topic else 0.0)  # nudge toward native art-tracks
                    if best is None or sort_key > best[0]:
                        best = (sort_key, vid, is_topic)
            if best:
                return best[1], ("song" if best[2] else "video")
            polite_sleep(0.4)
        return None, None

    def _durations(self, video_ids):
        """{videoId: duration_ms} via batched videos.list (1 unit per 50 ids).
        Best-effort: on a rate limit, flag and return what we have (scoring just
        loses the duration anchor for the rest)."""
        out = {}
        for i in range(0, len(video_ids), 50):
            chunk = video_ids[i:i + 50]
            if not chunk:
                continue
            try:
                resp = self._request("GET", "videos", params={"part": "contentDetails", "id": ",".join(chunk)})
            except requests.HTTPError as e:
                if "429" not in str(e):
                    raise
                self._rate_limited = True
                return out
            for it in resp.json().get("items", []):
                out[it["id"]] = _duration_ms(it.get("contentDetails", {}).get("duration"))
        return out

    def add(self, playlist, target_ids):
        for video_id in target_ids:  # one at a time, in order — append order is date-added order
            self._request("POST", "playlistItems", params={"part": "snippet"}, json_body={
                "snippet": {"playlistId": playlist["playlistId"],
                            "resourceId": {"kind": "youtube#video", "videoId": video_id}}})
            polite_sleep(1.0)

    def remove(self, playlist, track):
        if not track.get("playlistItemId"):
            return  # removal needs the playlist-item id (from playlist_tracks)
        self._request("DELETE", "playlistItems", params={"id": track["playlistItemId"]})
        polite_sleep(1.0)
