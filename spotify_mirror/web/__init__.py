"""FastAPI application for the web GUI (Phase 1).

Thin HTTP/SSE layer over the platform services (settings, events, sync,
accounts). Never reaches into the engine directly — it drives services, which
drive the engine.
"""

from fastapi import FastAPI


def create_app() -> FastAPI:
    app = FastAPI(title="Omni Playlist Sync")

    @app.get("/health")
    def health():
        return {"ok": True}

    return app


app = create_app()
