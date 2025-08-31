import os
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv
from . import routes

def create_app():
    load_dotenv()
    app = FastAPI(title="CareerWise-AI API")

    origins_str = os.getenv("ALLOWED_ORIGINS")
    origins = origins_str.split(",") if origins_str else []

    app.add_middleware(
        CORSMiddleware,
        allow_origins=origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    app.include_router(routes.router)
    return app