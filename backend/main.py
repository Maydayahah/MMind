import os
import tempfile
from contextlib import asynccontextmanager
from typing import Optional

from fastapi import BackgroundTasks, Depends, FastAPI, File, HTTPException, Query, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from auth import create_token, get_current_user_id, hash_password, verify_password
from ai_worker import organize_thoughts
from database import (
    batch_delete_thoughts,
    create_thought,
    create_user,
    delete_collection,
    delete_thought,
    get_collection_by_id,
    get_collections,
    get_stats,
    get_thoughts,
    get_thoughts_by_ids,
    get_user_by_username,
    init_db,
    update_collection,
    update_thought,
    update_thought_content,
    update_thought_tags,
)
from scheduler import start_scheduler, stop_scheduler


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    start_scheduler()
    yield
    stop_scheduler()


app = FastAPI(title="思绪 API", version="2.0.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


# ── Schemas ───────────────────────────────────────────────────────────────────

VOICE_PLACEHOLDER = "[语音处理中]"


class RegisterRequest(BaseModel):
    username: str
    password: str


class ThoughtCreate(BaseModel):
    content: str
    images: str = ""
    location: str = ""


class ThoughtUpdate(BaseModel):
    content: str
    tags: str = ""
    images: str = ""
    location: str = ""


class BatchDeleteRequest(BaseModel):
    ids: list[int]


class CollectionUpdate(BaseModel):
    title: str
    theme: str
    content: str


class OrganizeRequest(BaseModel):
    thought_ids: Optional[list[int]] = None


# ── Auth ──────────────────────────────────────────────────────────────────────

@app.post("/api/auth/register", status_code=201)
def register(body: RegisterRequest):
    if len(body.username) < 2 or len(body.password) < 6:
        raise HTTPException(status_code=400, detail="用户名至少2位，密码至少6位")
    if get_user_by_username(body.username):
        raise HTTPException(status_code=409, detail="用户名已被使用")
    user = create_user(body.username, hash_password(body.password))
    token = create_token(user["id"], user["username"])
    return {"token": token, "user_id": user["id"], "username": user["username"]}


@app.post("/api/auth/login")
def login(body: RegisterRequest):
    user = get_user_by_username(body.username)
    if not user or not verify_password(body.password, user["password_hash"]):
        raise HTTPException(status_code=401, detail="用户名或密码错误")
    token = create_token(user["id"], user["username"])
    return {"token": token, "user_id": user["id"], "username": user["username"]}


# ── Thoughts ──────────────────────────────────────────────────────────────────

@app.post("/api/thoughts", status_code=201)
def post_thought(
    body: ThoughtCreate,
    user_id: int = Depends(get_current_user_id),
):
    if not body.content.strip():
        raise HTTPException(status_code=400, detail="内容不能为空")
    return create_thought(body.content.strip(), body.images, body.location, user_id=user_id)


@app.get("/api/thoughts")
def list_thoughts(
    limit: int = Query(default=50, ge=1, le=200),
    ids: Optional[str] = Query(default=None),
    user_id: int = Depends(get_current_user_id),
):
    if ids:
        id_list = [int(i) for i in ids.split(",") if i.strip().isdigit()]
        return get_thoughts_by_ids(id_list, user_id=user_id)
    return get_thoughts(limit, user_id=user_id)


@app.patch("/api/thoughts/{thought_id}")
def edit_thought(
    thought_id: int,
    body: ThoughtUpdate,
    user_id: int = Depends(get_current_user_id),
):
    t = update_thought(thought_id, body.content, body.tags, body.images, body.location, user_id=user_id)
    if not t:
        raise HTTPException(status_code=404, detail="随想不存在")
    return t


@app.delete("/api/thoughts/{thought_id}")
def remove_thought(
    thought_id: int,
    user_id: int = Depends(get_current_user_id),
):
    if not delete_thought(thought_id, user_id=user_id):
        raise HTTPException(status_code=404, detail="随想不存在")
    return {"ok": True}


@app.delete("/api/thoughts")
def remove_thoughts_batch(
    body: BatchDeleteRequest,
    user_id: int = Depends(get_current_user_id),
):
    count = batch_delete_thoughts(body.ids, user_id=user_id)
    return {"deleted": count}


# ── Collections ───────────────────────────────────────────────────────────────

@app.get("/api/collections")
def list_collections(user_id: int = Depends(get_current_user_id)):
    return get_collections(user_id=user_id)


@app.get("/api/collections/{collection_id}")
def get_collection(
    collection_id: int,
    user_id: int = Depends(get_current_user_id),
):
    col = get_collection_by_id(collection_id, user_id=user_id)
    if not col:
        raise HTTPException(status_code=404, detail="文集不存在")
    return col


@app.patch("/api/collections/{collection_id}")
def edit_collection(
    collection_id: int,
    body: CollectionUpdate,
    user_id: int = Depends(get_current_user_id),
):
    col = update_collection(collection_id, body.title, body.theme, body.content, user_id=user_id)
    if not col:
        raise HTTPException(status_code=404, detail="文集不存在")
    return col


@app.delete("/api/collections/{collection_id}")
def remove_collection(
    collection_id: int,
    user_id: int = Depends(get_current_user_id),
):
    if not delete_collection(collection_id, user_id=user_id):
        raise HTTPException(status_code=404, detail="文集不存在")
    return {"ok": True}


# ── AI ────────────────────────────────────────────────────────────────────────

@app.post("/api/organize", status_code=202)
def trigger_organize(
    background_tasks: BackgroundTasks,
    body: Optional[OrganizeRequest] = None,
    user_id: int = Depends(get_current_user_id),
):
    ids = body.thought_ids if body else None
    background_tasks.add_task(organize_thoughts, ids, user_id)
    return {"message": "AI 整理任务已启动"}


@app.post("/api/thoughts/voice", status_code=201)
async def post_voice_thought(
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    location: str = "",
    tags: str = "",
    local_audio_uri: str = "",
    user_id: int = Depends(get_current_user_id),
):
    suffix = os.path.splitext(file.filename or "audio.m4a")[1] or ".m4a"
    with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp:
        tmp.write(await file.read())
        tmp_path = tmp.name

    thought = create_thought(
        content=VOICE_PLACEHOLDER,
        images="",
        location=location,
        audio=local_audio_uri,
        user_id=user_id,
    )
    if tags:
        update_thought_tags(thought["id"], tags)
        thought["tags"] = tags

    background_tasks.add_task(_transcribe_and_update, thought["id"], tmp_path)
    return thought


def _transcribe_and_update(thought_id: int, audio_path: str):
    try:
        import whisper
        model = whisper.load_model("base")
        result = model.transcribe(audio_path, language="zh")
        text = result["text"].strip()
        if text:
            update_thought_content(thought_id, text)
    except Exception as e:
        print(f"[Whisper] 转录失败 (id={thought_id}): {e}")
    finally:
        try:
            os.unlink(audio_path)
        except Exception:
            pass


@app.post("/api/transcribe")
async def transcribe_audio(
    file: UploadFile = File(...),
    user_id: int = Depends(get_current_user_id),
):
    try:
        import whisper
    except ImportError:
        raise HTTPException(status_code=503, detail="openai-whisper 未安装")

    suffix = os.path.splitext(file.filename or "audio.m4a")[1] or ".m4a"
    with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp:
        tmp.write(await file.read())
        tmp_path = tmp.name

    try:
        model = whisper.load_model("base")
        result = model.transcribe(tmp_path, language="zh")
        return {"text": result["text"].strip()}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"转录失败: {e}")
    finally:
        os.unlink(tmp_path)


# ── Stats ─────────────────────────────────────────────────────────────────────

@app.get("/api/stats")
def stats(user_id: int = Depends(get_current_user_id)):
    return get_stats(user_id=user_id)


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8003, reload=True)
