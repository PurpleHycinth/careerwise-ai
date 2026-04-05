from app import create_app

app = create_app()  # CORS is handled inside create_app() via ALLOWED_ORIGINS env var

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        "server:app",
        host="0.0.0.0",   # was 127.0.0.1 — that blocks Docker from reaching it
        port=8000,
        reload=True
    )