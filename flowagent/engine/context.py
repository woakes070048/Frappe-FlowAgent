# Copyright (c) 2026, FlowAgent and contributors
# For license information, please see license.txt
"""
Execution context: the shared variable bag a workflow run carries
between nodes, plus the renderer used to interpolate `{{var.path}}`
references in node config values.
"""

from __future__ import annotations

import json
import re
from typing import Any

import frappe


# Match {{ anything except }} }} — non-greedy so adjacent placeholders work.
_PLACEHOLDER = re.compile(r"\{\{\s*(.+?)\s*\}\}")


class Context:
    """Lightweight dict-with-dotted-paths plus a few utilities."""

    def __init__(self, seed: dict | None = None):
        self.data: dict[str, Any] = dict(seed or {})

    def get(self, path: str, default: Any = None) -> Any:
        """Get a value via dotted path: 'doc.customer.name'."""
        cur: Any = self.data
        for part in path.split("."):
            if cur is None:
                return default
            if isinstance(cur, dict):
                cur = cur.get(part)
            elif isinstance(cur, (list, tuple)) and part.isdigit():
                idx = int(part)
                cur = cur[idx] if 0 <= idx < len(cur) else None
            else:
                cur = getattr(cur, part, None)
        return cur if cur is not None else default

    def set(self, key: str, value: Any):
        # Top-level assignment by convention; nodes use simple names for
        # their `output` field, no nested writes needed.
        self.data[key] = value

    def snapshot(self) -> dict:
        """Return a JSON-safe copy of the context for persisting in the Run doc."""
        return _json_safe(self.data)


def render(template: str, data: dict) -> str:
    """Render a {{var.path}} template against the context dict.

    We deliberately do NOT use the full Jinja2 environment here — that
    surface is too large for user-authored templates and would let one
    workflow execute arbitrary Python via Jinja filters. We support:

        {{ var }}                — flat key
        {{ var.sub.path }}       — dotted access on dicts / objects / lists
        {{ var | upper }}        — a small whitelisted set of filters
        {{ var.amount * 100 }}   — basic arithmetic via the math filter

    For complex transformations, users have the `tf_code` (Python) and
    `tf_jinja` (full Frappe-rendered Jinja) nodes.
    """
    if not template or not isinstance(template, str):
        return template

    def _resolve(match: re.Match) -> str:
        expr = match.group(1).strip()
        # Split on pipe for filter chain
        parts = [p.strip() for p in expr.split("|")]
        head = parts[0]
        value = _eval_head(head, data)
        for filt in parts[1:]:
            value = _apply_filter(value, filt)
        if value is None:
            return ""
        if isinstance(value, (dict, list)):
            return json.dumps(value, default=str)
        return str(value)

    return _PLACEHOLDER.sub(_resolve, template)


def _eval_head(expr: str, data: dict) -> Any:
    """Resolve the part before any filter pipe.

    Supports dotted access and a tiny expression grammar: <name> [op <number>]
    where op is one of + - * /. Anything fancier should use tf_code.
    """
    # Bare-number literal
    if _is_number(expr):
        return float(expr) if "." in expr else int(expr)

    # Try as a simple arithmetic expression on a single var
    for op in ("*", "/", "+", "-"):
        if op in expr:
            left, right = expr.split(op, 1)
            left_val = _lookup(left.strip(), data)
            right_str = right.strip()
            if _is_number(right_str):
                right_val: Any = float(right_str)
                try:
                    left_num = float(left_val) if left_val is not None else 0
                    if op == "*": return left_num * right_val
                    if op == "/": return left_num / right_val if right_val else 0
                    if op == "+": return left_num + right_val
                    if op == "-": return left_num - right_val
                except (TypeError, ValueError):
                    return ""
            break

    return _lookup(expr, data)


def _lookup(path: str, data: dict) -> Any:
    cur: Any = data
    for part in path.split("."):
        if cur is None:
            return None
        if isinstance(cur, dict):
            cur = cur.get(part)
        elif isinstance(cur, (list, tuple)) and part.isdigit():
            idx = int(part)
            cur = cur[idx] if 0 <= idx < len(cur) else None
        else:
            cur = getattr(cur, part, None)
    return cur


def _apply_filter(value: Any, filt: str) -> Any:
    """A deliberately small filter set. Add more carefully — every filter
    is a potential injection surface."""
    name = filt.split("(")[0].strip()
    if name == "upper":
        return str(value).upper() if value is not None else ""
    if name == "lower":
        return str(value).lower() if value is not None else ""
    if name == "title":
        return str(value).title() if value is not None else ""
    if name == "strip":
        return str(value).strip() if value is not None else ""
    if name == "json":
        return json.dumps(value, default=str)
    if name == "length":
        try:
            return len(value)
        except TypeError:
            return 0
    if name == "default":
        # {{ var | default('N/A') }}
        m = re.match(r"default\(['\"](.+?)['\"]\)", filt)
        return value if value not in (None, "") else (m.group(1) if m else "")
    if name == "round":
        m = re.match(r"round\((\d+)\)", filt)
        digits = int(m.group(1)) if m else 0
        try:
            return round(float(value), digits)
        except (TypeError, ValueError):
            return value
    if name == "currency":
        try:
            return frappe.utils.fmt_money(float(value))
        except (TypeError, ValueError):
            return value
    # Unknown filter — pass through silently
    return value


def _is_number(s: str) -> bool:
    try:
        float(s)
        return True
    except (TypeError, ValueError):
        return False


def _json_safe(value: Any) -> Any:
    """Convert to something json.dumps can definitely handle."""
    if isinstance(value, dict):
        return {k: _json_safe(v) for k, v in value.items()}
    if isinstance(value, (list, tuple)):
        return [_json_safe(v) for v in value]
    if isinstance(value, (str, int, float, bool)) or value is None:
        return value
    return str(value)
