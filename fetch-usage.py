#!/usr/bin/env python3
# -*- coding: utf-8 -*-
# ============================================================
#  ai-usage.widget / fetch-usage.py   ——  本地 CLI 版
# ------------------------------------------------------------
#  直接运行本地命令(默认 ccusage,读 ~/.claude 本地 JSONL),
#  拿到 JSON 后解析成 widget 需要的结构。全程本地、无网络请求。
#
#  · Claude Code 用量 → ccusage(https://github.com/ryoppippi/ccusage)
#  · ccusage 亦支持 OpenAI Codex CLI 的本地日志(见 README)
#  · 也可换成任何输出 JSON 的命令,用 parser=paths 自定义取值路径
# ============================================================

import base64
import json
import os
import subprocess
from datetime import date, datetime, timedelta

TIMEOUT = 120  # 首次 npx 下载可能较慢

# Übersicht 用 `/bin/zsh -lc` 启动,只加载 .zprofile 不读 .zshrc;
# 如果 Homebrew/nvm 的 PATH 不在 .zprofile 里就会"找不到命令"。
# 这里显式把常见路径前置注入 subprocess 环境,作为双保险。
SUBPROC_ENV = os.environ.copy()
SUBPROC_ENV["PATH"] = ":".join([
    "/opt/homebrew/bin", "/opt/homebrew/sbin",
    "/usr/local/bin", "/usr/local/sbin",
    os.path.expanduser("~/.local/bin"),
    SUBPROC_ENV.get("PATH", ""),
])

# ============================================================
#  配置
#  command : 要执行的命令(argv 数组)
#  parser  : ccusage_blocks(默认) | paths(通用)
#  metric  : cost(美元) | tokens(令牌)  —— 仅 ccusage_blocks 用
#  cost_limit / token_limit : 进度条上限(预警线,按需调)
# ============================================================
# npx 绝对路径(Homebrew 安装时的位置)。如果你的 node 不在这,
# 用 `which npx` 查到后改这里;或全局装 ccusage 后用 NPX = None。
NPX = "/opt/homebrew/bin/npx"

CONFIG = {
    "claude": {
        "label": "Claude Code",
        "plan": "Max $200",        # 右上角 badge 文字(手填,本地日志无此信息)
        "account_url": "https://claude.ai/settings/profile",  # 点账户名跳转
        "command": [NPX, "-y", "ccusage@latest", "blocks", "--active", "--json"],
        "parser": "ccusage_blocks",
        "metric": "tokens",        # cost | tokens
        "cost_limit": 50.0,        # 副指标(USD)上限
        "token_limit": 10_000_000, # 5h 窗口的预警上限(10 Mtok)
        # False = 只算 input+output+cacheWrite(真消耗);
        # True  = 把 cacheRead 也计入(ccusage 默认口径)。
        "count_cache_reads": True,
        # 多粒度统计:数据源命令 + 字段名映射。
        "stats": {
            "command": [NPX, "-y", "ccusage@latest", "claude", "daily", "--json"],
            "date_field": "date",
            "tokens_field": "totalTokens",
            "cost_field": "totalCost",
        },
        # 多粒度"参考额度"(非官方,用于算剩余/百分比)。
        # 按 Max $200 套餐 + 你过往数据粗估,觉得偏紧/偏松直接改。
        "stats_limits": {
            "today": {"tokens": 30_000_000, "cost": 30},
            "week":  {"tokens": 200_000_000, "cost": 200},
            "month": {"tokens": 800_000_000, "cost": 800},
        },
    },
    "chatgpt": {
        "label": "Codex",
        "plan": "Plus $20",
        "account_url": "https://chatgpt.com/#settings/Account",  # 点账户名跳转
        # ccusage codex 没有 blocks 子命令(Codex 非 5h 滑窗),
        # 这里改用 monthly 输出本月累计。
        "command": [NPX, "-y", "ccusage@latest", "codex", "monthly", "--json"],
        "parser": "ccusage_codex_monthly",
        "metric": "tokens",
        "cost_limit": 20.0,
        "token_limit": 10_000_000, # 月度预警上限(10 Mtok,Plus 套餐较紧)
        "count_cache_reads": True,
        "stats": {
            "command": [NPX, "-y", "ccusage@latest", "codex", "daily", "--json"],
            "date_field": "date",
            "tokens_field": "totalTokens",
            "cost_field": "costUSD",   # codex 用 costUSD,不是 totalCost
        },
        # Plus $20 套餐粗估,实际容量按你用量调。
        "stats_limits": {
            "today": {"tokens": 3_000_000, "cost": 1},
            "week":  {"tokens": 15_000_000, "cost": 5},
            "month": {"tokens": 50_000_000, "cost": 20},
        },
    },
}


# ---------- 运行命令 ----------
def run_cmd(argv):
    res = subprocess.run(argv, capture_output=True, text=True,
                         timeout=TIMEOUT, env=SUBPROC_ENV)
    out = (res.stdout or "").strip()
    if not out:
        raise RuntimeError((res.stderr or "命令无输出").strip()[:140])
    i = out.find("{")            # 容错:跳过可能的前导噪声
    if i > 0:
        out = out[i:]
    return json.loads(out)


# ---------- 通用取值工具(parser=paths 用) ----------
def dig(obj, path):
    if not path:
        return None
    cur = obj
    for part in path.split("."):
        if part == "":
            continue
        if isinstance(cur, list):
            try:
                cur = cur[int(part)]
            except (ValueError, IndexError):
                return None
        elif isinstance(cur, dict):
            cur = cur.get(part)
            if cur is None:
                return None
        else:
            return None
    return cur


def to_num(v):
    if isinstance(v, bool):
        return None
    if isinstance(v, (int, float)):
        return v
    if isinstance(v, str):
        try:
            return float(v) if "." in v else int(v)
        except ValueError:
            return None
    return None


def normalize_reset(v):
    if v is None:
        return ""
    if isinstance(v, (int, float)):
        sec = v / 1000.0 if v > 1e12 else float(v)
        try:
            return datetime.fromtimestamp(sec).isoformat(timespec="seconds")
        except Exception:
            return ""
    return v if isinstance(v, str) else ""


def ok(used, limit, used_raw, limit_raw, unit, reset, alt=None):
    ratio = min(used_raw / limit_raw, 1.0) if limit_raw and limit_raw > 0 else 0.0
    d = {"ok": True, "used": used, "limit": limit,
         "ratio": round(ratio, 4), "unit": unit, "resetISO": reset or ""}
    if alt is not None:
        d["alt"] = alt
    return d


def err(msg, unit=""):
    return {"ok": False, "used": 0, "limit": 0, "ratio": 0.0,
            "unit": unit, "resetISO": "", "error": msg}


# ---------- 解析:ccusage blocks --json ----------
def parse_ccusage_blocks(j, cfg):
    blocks = j.get("blocks") or []
    blk = next((b for b in blocks if b.get("isActive")), None)
    if blk is None and blocks:
        blk = blocks[-1]
    metric = cfg.get("metric", "cost")
    cost_lim = float(cfg.get("cost_limit", 0) or 0)
    tok_lim = float(cfg.get("token_limit", 0) or 0)

    if blk is None:
        used_cost, used_tok, reset = 0.0, 0.0, ""
    else:
        used_cost = float(to_num(blk.get("costUSD", 0)) or 0.0)
        tc = blk.get("tokenCounts", {}) or {}
        keys = ["inputTokens", "outputTokens", "cacheCreationInputTokens"]
        if cfg.get("count_cache_reads", True):
            keys.append("cacheReadInputTokens")
        used_tok = float(sum((to_num(tc.get(k, 0)) or 0) for k in keys))
        reset = blk.get("endTime", "") or ""

    if metric == "tokens":
        alt = {"used": round(used_cost, 2), "unit": "USD"}
        return ok(round(used_tok / 1e6, 2), round(tok_lim / 1e6, 2),
                  used_tok, tok_lim, "Mtok", reset, alt)
    alt = {"used": round(used_tok / 1e6, 2), "unit": "Mtok"}
    return ok(round(used_cost, 2), round(cost_lim, 2),
              used_cost, cost_lim, "USD", reset, alt)


# ---------- 解析:通用路径 ----------
def parse_paths(j, cfg):
    paths = cfg.get("paths", {}) or {}
    unit = cfg.get("unit", "")
    used = to_num(dig(j, paths.get("used", "")))
    limit = to_num(dig(j, paths.get("limit", "")))
    if used is None or limit is None:
        return err("解析路径未命中,检查 paths/响应结构", unit)
    reset = normalize_reset(dig(j, paths.get("reset", "")))
    return ok(used, limit, used, limit, unit, reset)


# ---------- 解析:ccusage codex monthly --json ----------
# 取本月那条(按 YYYY-MM 匹配当月,找不到则用列表最后一条)。
# Codex 无 5h 窗口,reset 用月末当作"下次清零"。
def parse_ccusage_codex_monthly(j, cfg):
    months = j.get("monthly") or []
    metric = cfg.get("metric", "cost")
    cost_lim = float(cfg.get("cost_limit", 0) or 0)
    tok_lim = float(cfg.get("token_limit", 0) or 0)

    now = datetime.now()
    if now.month == 12:
        reset_dt = datetime(now.year + 1, 1, 1)
    else:
        reset_dt = datetime(now.year, now.month + 1, 1)
    reset = reset_dt.isoformat(timespec="seconds")

    if not months:
        used_cost, used_tok = 0.0, 0.0
    else:
        tag = now.strftime("%Y-%m")
        blk = next((m for m in months if m.get("month") == tag), months[-1])
        used_cost = float(to_num(blk.get("costUSD", 0)) or 0.0)
        # codex 的字段:cachedInputTokens(缓存读) + inputTokens + outputTokens,
        # totalTokens 已含缓存读;关掉就只算 input+output。
        if cfg.get("count_cache_reads", True):
            used_tok = float(to_num(blk.get("totalTokens", 0)) or 0.0)
        else:
            used_tok = float(
                (to_num(blk.get("inputTokens", 0)) or 0)
                + (to_num(blk.get("outputTokens", 0)) or 0)
            )

    if metric == "tokens":
        alt = {"used": round(used_cost, 2), "unit": "USD"}
        return ok(round(used_tok / 1e6, 2), round(tok_lim / 1e6, 2),
                  used_tok, tok_lim, "Mtok", reset, alt)
    alt = {"used": round(used_tok / 1e6, 2), "unit": "Mtok"}
    return ok(round(used_cost, 2), round(cost_lim, 2),
              used_cost, cost_lim, "USD", reset, alt)


PARSERS = {
    "ccusage_blocks": parse_ccusage_blocks,
    "ccusage_codex_monthly": parse_ccusage_codex_monthly,
    "paths": parse_paths,
}


def provider_result(cfg):
    argv = cfg.get("command") or []
    if not argv:
        return err("未配置 command")
    try:
        j = run_cmd(argv)
    except FileNotFoundError:
        return err("找不到命令(node/npx 是否在 PATH?见 README)")
    except subprocess.TimeoutExpired:
        return err("命令超时(首次 npx 下载慢,建议全局装 ccusage)")
    except json.JSONDecodeError:
        return err("命令输出非 JSON(确认带了 --json)")
    except Exception as e:
        return err(str(e)[:140])
    parser = PARSERS.get(cfg.get("parser", "ccusage_blocks"), parse_ccusage_blocks)
    try:
        return parser(j, cfg)
    except Exception as e:
        return err("解析失败:" + str(e)[:120])


# ---------- 多粒度统计:今日/本周/本月 ----------
# 调一次 ccusage <agent> daily --json,Python 聚合三档。
# Claude 用 totalCost,Codex 用 costUSD —— 字段名通过 cfg["stats"] 指定。
def fetch_stats(cfg):
    stats_cfg = (cfg or {}).get("stats") or {}
    cmd = stats_cfg.get("command") or []
    if not cmd:
        return None
    date_f = stats_cfg.get("date_field", "date")
    tok_f = stats_cfg.get("tokens_field", "totalTokens")
    cost_f = stats_cfg.get("cost_field", "totalCost")
    ccr = cfg.get("count_cache_reads", True)
    try:
        res = subprocess.run(cmd, capture_output=True, text=True,
                             timeout=TIMEOUT, env=SUBPROC_ENV)
        out = (res.stdout or "").strip()
        i = out.find("{")
        if i > 0:
            out = out[i:]
        j = json.loads(out)
    except Exception:
        return None

    today = date.today()
    week_start = today - timedelta(days=6)    # 滚动 7 天(含今天)
    month_start = today - timedelta(days=29)  # 滚动 30 天(含今天)

    buckets = {"today": [0, 0.0], "week": [0, 0.0], "month": [0, 0.0]}
    per_day = {}  # ISO date -> {tokens, cost, models}
    for d in j.get("daily") or []:
        try:
            dt = date.fromisoformat((d.get(date_f) or "")[:10])
        except ValueError:
            continue
        tokens = int(to_num(d.get(tok_f, 0)) or 0)
        cost = float(to_num(d.get(cost_f, 0)) or 0)
        models = []
        for m in (d.get("modelBreakdowns") or []):
            mtok = ((to_num(m.get("inputTokens", 0)) or 0)
                    + (to_num(m.get("outputTokens", 0)) or 0)
                    + (to_num(m.get("cacheCreationTokens", 0)) or 0))
            if ccr:
                mtok += (to_num(m.get("cacheReadTokens", 0)) or 0)
            mcost = float(to_num(m.get("cost", m.get("costUSD", 0))) or 0)
            models.append({
                "name": m.get("modelName") or "?",
                "cost": round(mcost, 2),
                "tokens": int(mtok),
            })
        models.sort(key=lambda x: x["cost"], reverse=True)
        per_day[dt.isoformat()] = {"tokens": tokens, "cost": cost, "models": models}
        if dt == today:
            buckets["today"][0] += tokens; buckets["today"][1] += cost
        if week_start <= dt <= today:
            buckets["week"][0] += tokens;  buckets["week"][1] += cost
        if month_start <= dt <= today:
            buckets["month"][0] += tokens; buckets["month"][1] += cost

    # 逐日序列:从 month_start 到今天补齐每一天(空缺补 0),升序。
    series = []
    cur = month_start
    while cur <= today:
        iso = cur.isoformat()
        rec = per_day.get(iso) or {"tokens": 0, "cost": 0.0, "models": []}
        series.append({"date": iso, "tokens": int(rec["tokens"]),
                       "cost": round(rec["cost"], 2), "models": rec.get("models") or []})
        cur += timedelta(days=1)

    return {
        "buckets": {k: {"tokens": int(v[0]), "cost": round(v[1], 2)}
                    for k, v in buckets.items()},
        "series": series,
    }


# ---------- 当前登录账户(本地配置,只读) ----------
def _jwt_email(idt):
    try:
        seg = idt.split(".")[1]
        seg += "=" * (-len(seg) % 4)
        return json.loads(base64.urlsafe_b64decode(seg)).get("email") or ""
    except Exception:
        return ""


def read_account(name):
    try:
        if name == "claude":
            p = os.path.expanduser("~/.claude.json")
            with open(p, encoding="utf-8") as f:
                d = json.load(f)
            return (d.get("oauthAccount") or {}).get("emailAddress") or ""
        if name == "chatgpt":
            p = os.path.expanduser("~/.codex/auth.json")
            with open(p, encoding="utf-8") as f:
                d = json.load(f)
            return _jwt_email((d.get("tokens") or {}).get("id_token") or "")
    except Exception:
        return ""
    return ""


def main():
    now = datetime.now()
    out = {"asOf": now.strftime("%H:%M"), "date": "%d月%d日" % (now.month, now.day),
           "ts": int(now.timestamp())}
    for name, cfg in CONFIG.items():
        r = provider_result(cfg)
        r["label"] = cfg.get("label", name)
        r["plan"] = cfg.get("plan", "")
        r["account"] = read_account(name)
        r["accountUrl"] = cfg.get("account_url", "")
        r["ts"] = int(datetime.now().timestamp())
        out[name] = r
    for name, cfg in CONFIG.items():
        if not out.get(name):
            continue
        s = fetch_stats(cfg)
        if not s:
            continue
        buckets = s.get("buckets") or {}
        lims = cfg.get("stats_limits") or {}
        for k, v in buckets.items():
            lim = lims.get(k) or {}
            v["limit_tokens"] = int(lim.get("tokens", 0) or 0)
            v["limit_cost"] = float(lim.get("cost", 0) or 0)
        out[name]["stats"] = buckets
        out[name]["series"] = s.get("series") or []
    print(json.dumps(out, ensure_ascii=False))


if __name__ == "__main__":
    try:
        main()
    except Exception as e:
        print(json.dumps({"fatal": str(e)[:200]}, ensure_ascii=False))
