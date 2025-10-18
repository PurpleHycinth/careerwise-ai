# server.py or main.py
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app import create_app

app = create_app()  # your existing factory

# ✅ Add this CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173"
    ],  # frontend dev server URLs
    allow_credentials=True,
    allow_methods=["*"],  # allow POST, GET, OPTIONS, etc.
    allow_headers=["*"],  # allow all custom headers
)

# ✅ Start server correctly for FastAPI
if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="127.0.0.1", port=8000, reload=True)
