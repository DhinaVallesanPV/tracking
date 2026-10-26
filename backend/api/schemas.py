from pydantic import BaseModel
from typing import Optional, List, Any

class UploadResponse(BaseModel):
    job_id: str

class RoiInput(BaseModel):
    id: str
    name: str
    polygon: List[List[int]]

class ProcessRequest(BaseModel):
    rois: List[RoiInput]

class ProcessResponse(BaseModel):
    status: str

class StatusResponse(BaseModel):
    status: str
    detail: Optional[str] = None
    progress: Optional[float] = 0.0
    current_frame: Optional[int] = 0
    total_frames: Optional[int] = 0

