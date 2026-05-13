import sqlite3
import os
from datetime import datetime, date, timedelta

DB_PATH = os.path.join(os.path.dirname(__file__), "thoughts.db")


def get_conn():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def get_db():
    return get_conn()


def init_db():
    conn = get_conn()
    conn.executescript("""
        CREATE TABLE IF NOT EXISTS users (
            id            INTEGER PRIMARY KEY AUTOINCREMENT,
            username      TEXT    NOT NULL UNIQUE,
            password_hash TEXT    NOT NULL,
            created_at    TEXT    NOT NULL DEFAULT (datetime('now'))
        );
        CREATE TABLE IF NOT EXISTS thoughts (
            id         INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id    INTEGER REFERENCES users(id),
            content    TEXT    NOT NULL,
            tags       TEXT    DEFAULT '',
            images     TEXT    DEFAULT '',
            location   TEXT    DEFAULT '',
            audio      TEXT    DEFAULT '',
            created_at TEXT    NOT NULL DEFAULT (datetime('now'))
        );
        CREATE TABLE IF NOT EXISTS collections (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id     INTEGER REFERENCES users(id),
            title       TEXT NOT NULL,
            theme       TEXT NOT NULL,
            content     TEXT NOT NULL,
            thought_ids TEXT DEFAULT '',
            period      TEXT DEFAULT '',
            created_at  TEXT NOT NULL DEFAULT (datetime('now'))
        );
        CREATE TABLE IF NOT EXISTS insights (
            id         INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id    INTEGER REFERENCES users(id),
            content    TEXT NOT NULL,
            created_at TEXT NOT NULL DEFAULT (datetime('now'))
        );
    """)
    conn.commit()
    # 迁移旧数据库：安全地添加新列
    for sql in [
        "ALTER TABLE thoughts ADD COLUMN images TEXT DEFAULT ''",
        "ALTER TABLE thoughts ADD COLUMN location TEXT DEFAULT ''",
        "ALTER TABLE thoughts ADD COLUMN audio TEXT DEFAULT ''",
        "ALTER TABLE thoughts ADD COLUMN user_id INTEGER",
        "ALTER TABLE collections ADD COLUMN user_id INTEGER",
    ]:
        try:
            conn.execute(sql)
            conn.commit()
        except Exception:
            pass
    conn.close()


# ── Users ────────────────────────────────────────────────────────────────────

def create_user(username: str, password_hash: str) -> dict:
    conn = get_conn()
    try:
        cur = conn.execute(
            "INSERT INTO users (username, password_hash) VALUES (?, ?)",
            (username, password_hash),
        )
        conn.commit()
        row = conn.execute("SELECT id, username, created_at FROM users WHERE id=?", (cur.lastrowid,)).fetchone()
        return dict(row)
    finally:
        conn.close()


def get_user_by_username(username: str) -> dict | None:
    conn = get_conn()
    row = conn.execute(
        "SELECT * FROM users WHERE username=?", (username,)
    ).fetchone()
    conn.close()
    return dict(row) if row else None


# ── Thoughts ────────────────────────────────────────────────────────────────

def create_thought(
    content: str, images: str = "", location: str = "", audio: str = "",
    user_id: int | None = None,
) -> dict:
    conn = get_conn()
    now = datetime.utcnow().isoformat()
    cur = conn.execute(
        "INSERT INTO thoughts (user_id, content, tags, images, location, audio, created_at)"
        " VALUES (?, ?, ?, ?, ?, ?, ?)",
        (user_id, content, "", images, location, audio, now),
    )
    conn.commit()
    row = conn.execute("SELECT * FROM thoughts WHERE id=?", (cur.lastrowid,)).fetchone()
    conn.close()
    return dict(row)


def get_thoughts(limit: int = 50, user_id: int | None = None) -> list[dict]:
    conn = get_conn()
    if user_id is not None:
        rows = conn.execute(
            "SELECT * FROM thoughts WHERE user_id=? ORDER BY created_at DESC LIMIT ?",
            (user_id, limit),
        ).fetchall()
    else:
        rows = conn.execute(
            "SELECT * FROM thoughts ORDER BY created_at DESC LIMIT ?", (limit,)
        ).fetchall()
    conn.close()
    return [dict(r) for r in rows]


def get_thoughts_by_ids(ids: list[int], user_id: int | None = None) -> list[dict]:
    if not ids:
        return []
    conn = get_conn()
    placeholders = ",".join("?" * len(ids))
    if user_id is not None:
        rows = conn.execute(
            f"SELECT * FROM thoughts WHERE id IN ({placeholders}) AND user_id=? ORDER BY created_at ASC",
            (*ids, user_id),
        ).fetchall()
    else:
        rows = conn.execute(
            f"SELECT * FROM thoughts WHERE id IN ({placeholders}) ORDER BY created_at ASC",
            ids,
        ).fetchall()
    conn.close()
    return [dict(r) for r in rows]


def update_thought(
    thought_id: int, content: str, tags: str, images: str, location: str,
    user_id: int | None = None,
) -> dict | None:
    conn = get_conn()
    if user_id is not None:
        conn.execute(
            "UPDATE thoughts SET content=?, tags=?, images=?, location=? WHERE id=? AND user_id=?",
            (content, tags, images, location, thought_id, user_id),
        )
    else:
        conn.execute(
            "UPDATE thoughts SET content=?, tags=?, images=?, location=? WHERE id=?",
            (content, tags, images, location, thought_id),
        )
    conn.commit()
    row = conn.execute("SELECT * FROM thoughts WHERE id=?", (thought_id,)).fetchone()
    conn.close()
    return dict(row) if row else None


def update_thought_content(thought_id: int, content: str):
    conn = get_conn()
    conn.execute("UPDATE thoughts SET content=? WHERE id=?", (content, thought_id))
    conn.commit()
    conn.close()


def update_thought_tags(thought_id: int, tags: str):
    conn = get_conn()
    conn.execute("UPDATE thoughts SET tags=? WHERE id=?", (tags, thought_id))
    conn.commit()
    conn.close()


def delete_thought(thought_id: int, user_id: int | None = None) -> bool:
    conn = get_conn()
    if user_id is not None:
        cur = conn.execute(
            "DELETE FROM thoughts WHERE id=? AND user_id=?", (thought_id, user_id)
        )
    else:
        cur = conn.execute("DELETE FROM thoughts WHERE id=?", (thought_id,))
    conn.commit()
    conn.close()
    return cur.rowcount > 0


def batch_delete_thoughts(ids: list[int], user_id: int | None = None) -> int:
    if not ids:
        return 0
    conn = get_conn()
    placeholders = ",".join("?" * len(ids))
    if user_id is not None:
        cur = conn.execute(
            f"DELETE FROM thoughts WHERE id IN ({placeholders}) AND user_id=?",
            (*ids, user_id),
        )
    else:
        cur = conn.execute(f"DELETE FROM thoughts WHERE id IN ({placeholders})", ids)
    conn.commit()
    conn.close()
    return cur.rowcount


def get_thoughts_last_n_days(days: int = 7, user_id: int | None = None) -> list[dict]:
    conn = get_conn()
    since = (datetime.utcnow() - timedelta(days=days)).isoformat()
    if user_id is not None:
        rows = conn.execute(
            "SELECT * FROM thoughts WHERE created_at>=? AND user_id=? ORDER BY created_at ASC",
            (since, user_id),
        ).fetchall()
    else:
        rows = conn.execute(
            "SELECT * FROM thoughts WHERE created_at>=? ORDER BY created_at ASC", (since,)
        ).fetchall()
    conn.close()
    return [dict(r) for r in rows]


# ── Collections ──────────────────────────────────────────────────────────────

def create_collection(
    title: str, theme: str, content: str, thought_ids: str, period: str,
    user_id: int | None = None,
) -> dict:
    conn = get_conn()
    now = datetime.utcnow().isoformat()
    cur = conn.execute(
        "INSERT INTO collections (user_id, title, theme, content, thought_ids, period, created_at)"
        " VALUES (?, ?, ?, ?, ?, ?, ?)",
        (user_id, title, theme, content, thought_ids, period, now),
    )
    conn.commit()
    row = conn.execute("SELECT * FROM collections WHERE id=?", (cur.lastrowid,)).fetchone()
    conn.close()
    return dict(row)


def get_collections(user_id: int | None = None) -> list[dict]:
    conn = get_conn()
    if user_id is not None:
        rows = conn.execute(
            "SELECT * FROM collections WHERE user_id=? ORDER BY created_at DESC", (user_id,)
        ).fetchall()
    else:
        rows = conn.execute("SELECT * FROM collections ORDER BY created_at DESC").fetchall()
    conn.close()
    return [dict(r) for r in rows]


def get_collection_by_id(collection_id: int, user_id: int | None = None) -> dict | None:
    conn = get_conn()
    if user_id is not None:
        row = conn.execute(
            "SELECT * FROM collections WHERE id=? AND user_id=?", (collection_id, user_id)
        ).fetchone()
    else:
        row = conn.execute(
            "SELECT * FROM collections WHERE id=?", (collection_id,)
        ).fetchone()
    conn.close()
    return dict(row) if row else None


def update_collection(
    collection_id: int, title: str, theme: str, content: str,
    user_id: int | None = None,
) -> dict | None:
    conn = get_conn()
    if user_id is not None:
        conn.execute(
            "UPDATE collections SET title=?, theme=?, content=? WHERE id=? AND user_id=?",
            (title, theme, content, collection_id, user_id),
        )
    else:
        conn.execute(
            "UPDATE collections SET title=?, theme=?, content=? WHERE id=?",
            (title, theme, content, collection_id),
        )
    conn.commit()
    row = conn.execute("SELECT * FROM collections WHERE id=?", (collection_id,)).fetchone()
    conn.close()
    return dict(row) if row else None


def delete_collection(collection_id: int, user_id: int | None = None) -> bool:
    conn = get_conn()
    if user_id is not None:
        cur = conn.execute(
            "DELETE FROM collections WHERE id=? AND user_id=?", (collection_id, user_id)
        )
    else:
        cur = conn.execute("DELETE FROM collections WHERE id=?", (collection_id,))
    conn.commit()
    conn.close()
    return cur.rowcount > 0


# ── Stats ────────────────────────────────────────────────────────────────────

def get_stats(user_id: int | None = None) -> dict:
    conn = get_conn()
    uid_filter = "AND user_id=?" if user_id is not None else ""
    params = (user_id,) if user_id is not None else ()

    total_thoughts = conn.execute(
        f"SELECT COUNT(*) FROM thoughts WHERE 1=1 {uid_filter}", params
    ).fetchone()[0]
    total_collections = conn.execute(
        f"SELECT COUNT(*) FROM collections WHERE 1=1 {uid_filter}", params
    ).fetchone()[0]

    date_rows = conn.execute(
        f"SELECT DISTINCT DATE(created_at) FROM thoughts WHERE 1=1 {uid_filter} ORDER BY created_at DESC",
        params,
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
        f"SELECT tags FROM thoughts WHERE tags!='' {uid_filter}", params
    ).fetchall():
        for tag in (row[0] or "").split(","):
            tag = tag.strip()
            if tag in counts:
                counts[tag] += 1

    if user_id is not None:
        insight_row = conn.execute(
            "SELECT content FROM insights WHERE user_id=? ORDER BY created_at DESC LIMIT 1",
            (user_id,),
        ).fetchone()
    else:
        insight_row = conn.execute(
            "SELECT content FROM insights ORDER BY created_at DESC LIMIT 1"
        ).fetchone()

    conn.close()
    total_tagged = sum(counts.values()) or 1
    distribution = {k: round(v / total_tagged * 100) for k, v in counts.items()}
    insight = (
        insight_row[0]
        if insight_row
        else (
            f"过去记录了 {total_thoughts} 条随想，整理成 {total_collections} 篇文集，"
            f"已连续记录 {streak} 天。保持记录的习惯，让思绪沉淀成智慧。"
        )
    )

    return {
        "total_thoughts": total_thoughts,
        "total_collections": total_collections,
        "streak_days": streak,
        "theme_distribution": distribution,
        "insight": insight,
    }
