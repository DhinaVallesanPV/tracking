from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import RedirectResponse, Response

from config import settings
from .routes import router as api_router

app = FastAPI(title="AI Video Tracking API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.middleware("http")
async def ensure_cors_headers(request, call_next):
    """Mirror allowed origins on responses that bypass the default CORS middleware."""
    response = await call_next(request)
    origin = request.headers.get("origin")
    
    # If CORS_ORIGINS contains "*", we allow the incoming origin explicitly
    # to support allow_credentials=True (which doesn't work with literal "*").
    if "*" in settings.CORS_ORIGINS:
        if origin:
            response.headers["Access-Control-Allow-Origin"] = origin
        else:
            response.headers["Access-Control-Allow-Origin"] = "*"
        response.headers["Access-Control-Allow-Credentials"] = "true"
        response.headers["Access-Control-Allow-Methods"] = "*"
        response.headers["Access-Control-Allow-Headers"] = "*"
    elif origin in settings.CORS_ORIGINS:
        response.headers.setdefault("Access-Control-Allow-Origin", origin)
        response.headers.setdefault("Access-Control-Allow-Credentials", "true")
    
    return response

app.include_router(api_router)


@app.get("/")
async def root():
    return RedirectResponse(url="/docs")


@app.get("/favicon.ico")
async def favicon():
    return Response(status_code=204)


@app.get("/health")
async def health():
    return {"status": "ok"}


@app.get("/downloads/video/{job_id}")
async def downloads_video_redirect(job_id: str):
    return RedirectResponse(url=f"/api/downloads/video/{job_id}")


@app.get("/downloads/csv/{job_id}")
async def downloads_csv_redirect(job_id: str):
    return RedirectResponse(url=f"/api/downloads/csv/{job_id}")
