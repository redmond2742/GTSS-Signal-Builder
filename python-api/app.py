"""
GTSS Completeness Checker API

FastAPI backend that accepts GTSS ZIP uploads or individual CSV/TXT files
and returns a completeness report.
"""

from fastapi import FastAPI, File, UploadFile, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from gtss_checker import check_gtss

app = FastAPI(
    title="GTSS Completeness Checker",
    description="Upload GTSS export files to get a completeness score for each signal.",
    version="1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
def health():
    return {"status": "ok"}


@app.post("/check-zip")
async def check_zip(file: UploadFile = File(...)):
    """Upload a GTSS ZIP file and get a completeness report."""
    if not file.filename.endswith(".zip"):
        raise HTTPException(status_code=400, detail="File must be a .zip archive")

    contents = await file.read()
    if len(contents) > 10 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="File too large (max 10MB)")

    try:
        result = check_gtss(contents)
    except Exception as e:
        raise HTTPException(status_code=422, detail=f"Failed to process GTSS files: {e}")

    return result


@app.post("/check-files")
async def check_files(files: list[UploadFile] = File(...)):
    """Upload individual GTSS .txt files and get a completeness report."""
    file_dict = {}
    for f in files:
        if not f.filename.endswith(".txt"):
            continue
        content = await f.read()
        if len(content) > 5 * 1024 * 1024:
            raise HTTPException(status_code=400, detail=f"{f.filename} too large (max 5MB)")
        file_dict[f.filename] = content.decode("utf-8-sig")

    if not file_dict:
        raise HTTPException(status_code=400, detail="No .txt files found in upload")

    try:
        result = check_gtss(file_dict)
    except Exception as e:
        raise HTTPException(status_code=422, detail=f"Failed to process GTSS files: {e}")

    return result


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
