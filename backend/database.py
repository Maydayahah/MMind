from __future__ import annotations

import sqlite3
import os
from datetime import datetime, date, timedelta

DB_PATH = os.path.join(os.path.dirname(__file__), "thoughts.db")
DEFAULT_USER_ID = "default"


def get_conn():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


# alias used by ai_worker.py
def get_db():
    return get_conn()


def init_db():
    conn = get_conn()
    conn.executescript("""
        CREATE TABLE IF NOT EXISTS thoughts (
            id         INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id    TEXT    NOT NULL DEFAULT 'default',
            content    TEXT    NOT NULL,
            tags       TEXT    DEFAULT '',
            images     TEXT    DEFAULT '',
            location   TEXT    DEFAULT '',
            audio      TEXT    DEFAULT '',
            created_at TEXT    NOT NULL DEFAULT (datetime('now'))
        );
        CREATE TABLE IF NOT EXISTS collections (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id     TEXT NOT NULL DEFAULT 'default',
            title       TEXT NOT NULL,
            theme       TEXT NOT NULL,
            content     TEXT NOT NULL,
            thought_ids TEXT DEFAULT '',
            period      TEXT DEFAULT '',
            created_at  TEXT NOT NULL DEFAULT (datetime('now'))
        );
    """)
    conn.commit()
    # 迁移旧数据库：安全地添加新列
    for sql in [
        "ALTER TABLE thoughts ADD COLUMN images TEXT DEFAULT ''",
        "ALTER TABLE thoughts ADD COLUMN location TEXT DEFAULT ''",
        "ALTER TABLE thoughts ADD COLUMN audio TEXT DEFAULT ''",
        "ALTER TABLE thoughts ADD COLUMN user_id TEXT NOT NULL DEFAULT 'default'",
        "ALTER TABLE collections ADD COLUMN user_id TEXT NOT NULL DEFAULT 'default'",
    ]:
        try:
            conn.execute(sql)
            conn.commit()
        except Exception:
            pass  # 列已存在
    conn.close()


# ── Thoughts ────────────────────────────────────────────────────────────────

def create_thought(
    content: str,
    images: str = "",
    location: str = "",
    audio: str = "",
    user_id: str = DEFAULT_USER_ID,
) -> dict:
    conn = get_conn()
    now = datetime.utcnow().isoformat()
    cur = conn.execute(
        "INSERT INTO thoughts (user_id, content, tags, images, location, audio, created_at)"
        " VALUES (?, ?, ?, ?, ?, ?, ?)",
        (user_id, content, "", images, location, audio, now),
    )
    conn.commit()
    row = conn.execute("SELECT * FROM thoughts WHERE id = ?", (cur.lastrowid,)).fetchone()
    conn.close()
    return dict(row)


def get_thoughts(
    limit: int = 50,
    ids: list[int] | None = None,
    user_id: str = DEFAULT_USER_ID,
) -> list[dict]:
    conn = get_conn()
    if ids:
        placeholders = ",".join("?" * len(ids))
        rows = conn.execute(
            f"SELECT * FROM thoughts WHERE user_id = ? AND id IN ({placeholders}) ORDER BY created_at DESC",
            [user_id, *ids],
        ).fetchall()
    else:
        rows = conn.execute(
            "SELECT * FROM thoughts WHERE user_id = ? ORDER BY created_at DESC LIMIT ?",
            (user_id, limit),
        ).fetchall()
    conn.close()
    return [dict(r) for r in rows]


def delete_thought(thought_id: int, user_id: str = DEFAULT_USER_ID) -> bool:
    conn = get_conn()
    cur = conn.execute(
        "DELETE FROM thoughts WHERE id = ? AND user_id = ?",
        (thought_id, user_id),
    )
    conn.commit()
    conn.close()
    return cur.rowcount > 0


def batch_delete_thoughts(ids: list[int], user_id: str = DEFAULT_USER_ID) -> int:
    if not ids:
        return 0
    conn = get_conn()
    placeholders = ",".join("?" * len(ids))
    cur = conn.execute(
        f"DELETE FROM thoughts WHERE user_id = ? AND id IN ({placeholders})",
        [user_id, *ids],
    )
    conn.commit()
    conn.close()
    return cur.rowcount


def get_thoughts_last_n_days(
    days: int = 7,
    user_id: str = DEFAULT_USER_ID,
) -> list[dict]:
    conn = get_conn()
    since = (datetime.utcnow() - timedelta(days=days)).isoformat()
    rows = conn.execute(
        "SELECT * FROM thoughts WHERE user_id = ? AND created_at >= ? ORDER BY created_at ASC",
        (user_id, since),
    ).fetchall()
    conn.close()
    return [dict(r) for r in rows]


def get_thoughts_by_ids(
    ids: list[int],
    user_id: str = DEFAULT_USER_ID,
) -> list[dict]:
    if not ids:
        return []
    conn = get_conn()
    placeholders = ",".join("?" * len(ids))
    rows = conn.execute(
        f"SELECT * FROM thoughts WHERE user_id = ? AND id IN ({placeholders}) ORDER BY created_at ASC",
        [user_id, *ids],
    ).fetchall()
    conn.close()
    return [dict(r) for r in rows]


def update_thought_tags(
    thought_id: int,
    tags: str,
    user_id: str = DEFAULT_USER_ID,
):
    conn = get_conn()
    conn.execute(
        "UPDATE thoughts SET tags = ? WHERE id = ? AND user_id = ?",
        (tags, thought_id, user_id),
    )
    conn.commit()
    conn.close()


# ── Collections ──────────────────────────────────────────────────────────────

def create_collection(
    title: str,
    theme: str,
    content: str,
    thought_ids: str,
    period: str,
    user_id: str = DEFAULT_USER_ID,
) -> dict:
    conn = get_conn()
    now = datetime.utcnow().isoformat()
    cur = conn.execute(
        "INSERT INTO collections (user_id, title, theme, content, thought_ids, period, created_at)"
        " VALUES (?, ?, ?, ?, ?, ?, ?)",
        (user_id, title, theme, content, thought_ids, period, now),
    )
    conn.commit()
    row = conn.execute(
        "SELECT * FROM collections WHERE id = ?", (cur.lastrowid,)
    ).fetchone()
    conn.close()
    return dict(row)


def get_collections(user_id: str = DEFAULT_USER_ID) -> list[dict]:
    conn = get_conn()
    rows = conn.execute(
        "SELECT * FROM collections WHERE user_id = ? ORDER BY created_at DESC",
        (user_id,),
    ).fetchall()
    conn.close()
    return [dict(r) for r in rows]


def get_collection_by_id(
    collection_id: int,
    user_id: str = DEFAULT_USER_ID,
) -> dict | None:
    conn = get_conn()
    row = conn.execute(
        "SELECT * FROM collections WHERE id = ? AND user_id = ?",
        (collection_id, user_id),
    ).fetchone()
    conn.close()
    return dict(row) if row else None


def update_collection(
    collection_id: int,
    title: str,
    theme: str,
    content: str,
    user_id: str = DEFAULT_USER_ID,
) -> dict | None:
    conn = get_conn()
    conn.execute(
        "UPDATE collections SET title=?, theme=?, content=? WHERE id=? AND user_id=?",
        (title, theme, content, collection_id, user_id),
    )
    conn.commit()
    row = conn.execute(
        "SELECT * FROM collections WHERE id=? AND user_id=?",
        (collection_id, user_id),
    ).fetchone()
    conn.close()
    return dict(row) if row else None


def delete_collection(collection_id: int, user_id: str = DEFAULT_USER_ID) -> bool:
    conn = get_conn()
    cur = conn.execute(
        "DELETE FROM collections WHERE id = ? AND user_id = ?",
        (collection_id, user_id),
    )
    conn.commit()
    conn.close()
    return cur.rowcount > 0


def update_thought(
    thought_id: int,
    content: str,
    tags: str,
    images: str,
    location: str,
    user_id: str = DEFAULT_USER_ID,
) -> dict | None:
    conn = get_conn()
    conn.execute(
        "UPDATE thoughts SET content=?, tags=?, images=?, location=? WHERE id=? AND user_id=?",
        (content, tags, images, location, thought_id, user_id),
    )
    conn.commit()
    row = conn.execute(
        "SELECT * FROM thoughts WHERE id=? AND user_id=?",
        (thought_id, user_id),
    ).fetchone()
    conn.close()
    return dict(row) if row else None


def update_thought_content(
    thought_id: int,
    content: str,
    user_id: str = DEFAULT_USER_ID,
):
    conn = get_conn()
    conn.execute(
        "UPDATE thoughts SET content = ? WHERE id = ? AND user_id = ?",
        (content, thought_id, user_id),
    )
    conn.commit()
    conn.close()


# ── Stats ────────────────────────────────────────────────────────────────────

def get_stats(user_id: str = DEFAULT_USER_ID) -> dict:
    conn = get_conn()

    total_thoughts = conn.execute(
        "SELECT COUNT(*) FROM thoughts WHERE user_id = ?",
        (user_id,),
    ).fetchone()[0]
    total_collections = conn.execute(
        "SELECT COUNT(*) FROM collections WHERE user_id = ?",
        (user_id,),
    ).fetchone()[0]

    date_rows = conn.execute(
        "SELECT DISTINCT DATE(created_at) FROM thoughts WHERE user_id = ? ORDER BY created_at DESC",
        (user_id,),
    ).fetchall()
    dates = [r[0] for r in date_rows]
    streak = 0
    if dates:
        check = date.today()
        for d_str in dates:
            d_obj = date.fromisoformat(d_str)
            if d_obj == check:
                streak += 1
                check = check - timedelta(days=1)
            elif d_obj < check:
                break

    tag_keys = ["创作与灵感", "生活观察", "技术思考", "阅读笔记"]
    counts = {k: 0 for k in tag_keys}
    for row in conn.execute(
        "SELECT tags FROM thoughts WHERE user_id = ? AND tags != ''",
        (user_id,),
    ).fetchall():
        for tag in (row[0] or "").split(","):
            tag = tag.strip()
            if tag in counts:
                counts[tag] += 1

    conn.close()

    total_tagged = sum(counts.values()) or 1
    distribution = {k: round(v / total_tagged * 100) for k, v in counts.items()}

    return {
        "total_thoughts": total_thoughts,
        "total_collections": total_collections,
        "streak_days": streak,
        "theme_distribution": distribution,
        "insight": (
            f"过去记录了 {total_thoughts} 条随想，整理成 {total_collections} 篇文集，"
            f"已连续记录 {streak} 天。保持记录的习惯，让思绪沉淀成智慧。"
        ),
    }
