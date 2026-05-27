# Copyright (c) 2026, FlowAgent and contributors
# For license information, please see license.txt
"""
Logic nodes: condition, wait, loop, parallel.
"""

from __future__ import annotations

import time

import frappe

from . import BaseExecutor, node


@node("logic_condition")
class ConditionNode(BaseExecutor):
    """Boolean branch. cfg.expr is a string expression that must evaluate
    to truthy / falsy under the current context.

    We do NOT use Python's eval — instead a tiny safe evaluator that
    supports comparisons, and/or, and dotted variable lookup. For
    anything complex use a tf_code node first.
    """

    def run(self, *, node, cfg, context, runner):
        expr = (cfg.get("expr") or "").strip()
        if not expr:
            return ("out-yes", True)  # vacuous truth
        try:
            result = _safe_eval(expr, context.data)
        except Exception as e:
            frappe.throw(f"Condition error: {e}")
        port = "out-yes" if result else "out-no"
        return (port, bool(result))


@node("logic_wait")
class WaitNode(BaseExecutor):
    """Sleep for N seconds. cfg.seconds — int."""

    def run(self, *, node, cfg, context, runner):
        sec = float(cfg.get("seconds") or 0)
        # Cap at 60s for synchronous runs — anything longer should be a scheduled workflow
        sec = min(sec, 60)
        if sec > 0:
            time.sleep(sec)
        return {"waited_seconds": sec}


@node("logic_loop")
class LoopNode(BaseExecutor):
    """Iterate over a list in context, re-firing downstream nodes for each item.

    cfg:
      items     — Jinja-rendered, expected to resolve to a list (or JSON list string)
      item_var  — variable name to expose each item under (default 'item')
      max_items — safety cap (default 100)

    Implementation note: rather than re-engineering the queue model, the
    loop node executes its downstream subgraph synchronously per item by
    cloning a Runner-like context push/pop. For a v1 we implement the
    simpler shape: the loop node iterates and stuffs each item into the
    context, and we expect a *single* downstream chain that gets walked
    once per item. The chain is the path from the loop's `out` port.
    """

    def run(self, *, node, cfg, context, runner):
        from ..runner import SKIP

        items = cfg.get("items")
        if isinstance(items, str):
            # Try parsing as JSON
            import json as _json
            try:
                items = _json.loads(items)
            except _json.JSONDecodeError:
                # Comma-split fallback
                items = [s.strip() for s in items.split(",") if s.strip()]
        if not isinstance(items, list):
            items = [items] if items is not None else []

        item_var = cfg.get("item_var") or "item"
        max_items = int(cfg.get("max_items") or 100)
        items = items[:max_items]

        # Walk the downstream subgraph once per item.
        successors = runner.outgoing.get(node["id"], [])
        downstream_ids = [e["to"] for e in successors if (e.get("fromPort") or "out") == "out"]

        results = []
        for i, it in enumerate(items):
            context.set(item_var, it)
            context.set(f"{item_var}_index", i)
            for ds in downstream_ids:
                runner._walk(ds)
            results.append(it)

        # We've already walked the downstream chains ourselves — tell the
        # outer runner to not walk them again.
        return SKIP if downstream_ids else results


@node("logic_parallel")
class ParallelNode(BaseExecutor):
    """Fan-out: all out edges are taken simultaneously by the runner's
    natural breadth-first behaviour. This node is mostly a marker — the
    runner already enqueues all matching successors.

    We just record the fan-out width as the output."""

    def run(self, *, node, cfg, context, runner):
        successors = runner.outgoing.get(node["id"], [])
        return {"branches": len(successors)}


# -------------------------------------------------------------------------
# Safe expression evaluator
# -------------------------------------------------------------------------
def _safe_eval(expr: str, data: dict):
    """Evaluate a comparison/boolean expression against the context.

    Supports:
      - Variables: any dotted path
      - Literals: numbers, "strings", true/false, null
      - Comparisons: == != < <= > >=
      - Boolean: and, or, not
      - 'in' for membership
      - Parentheses

    Uses `ast` to parse, then walks the tree, refusing anything outside
    the allowed node types. Much safer than eval().
    """
    import ast

    # Normalise word literals to Python syntax
    expr_py = expr.replace("&&", " and ").replace("||", " or ")
    expr_py = _replace_word(expr_py, "true", "True")
    expr_py = _replace_word(expr_py, "false", "False")
    expr_py = _replace_word(expr_py, "null", "None")

    tree = ast.parse(expr_py, mode="eval")

    def _ev(node):
        if isinstance(node, ast.Expression):
            return _ev(node.body)
        if isinstance(node, ast.BoolOp):
            vals = [_ev(v) for v in node.values]
            if isinstance(node.op, ast.And): return all(vals)
            if isinstance(node.op, ast.Or):  return any(vals)
        if isinstance(node, ast.UnaryOp) and isinstance(node.op, ast.Not):
            return not _ev(node.operand)
        if isinstance(node, ast.Compare):
            left = _ev(node.left)
            for op, comp in zip(node.ops, node.comparators):
                right = _ev(comp)
                if isinstance(op, ast.Eq):    ok = left == right
                elif isinstance(op, ast.NotEq): ok = left != right
                elif isinstance(op, ast.Lt):  ok = _num(left) < _num(right)
                elif isinstance(op, ast.LtE): ok = _num(left) <= _num(right)
                elif isinstance(op, ast.Gt):  ok = _num(left) > _num(right)
                elif isinstance(op, ast.GtE): ok = _num(left) >= _num(right)
                elif isinstance(op, ast.In):  ok = left in right
                elif isinstance(op, ast.NotIn): ok = left not in right
                else: raise ValueError(f"Unsupported comparison: {op}")
                if not ok: return False
                left = right
            return True
        if isinstance(node, ast.Constant):
            return node.value
        if isinstance(node, ast.Name):
            return data.get(node.id)
        if isinstance(node, ast.Attribute):
            base = _ev(node.value)
            if isinstance(base, dict):
                return base.get(node.attr)
            return getattr(base, node.attr, None)
        if isinstance(node, ast.Subscript):
            base = _ev(node.value)
            key = _ev(node.slice)
            try:
                return base[key]
            except (KeyError, IndexError, TypeError):
                return None
        if isinstance(node, ast.List):
            return [_ev(e) for e in node.elts]
        if isinstance(node, ast.Tuple):
            return tuple(_ev(e) for e in node.elts)
        raise ValueError(f"Unsupported expression node: {type(node).__name__}")

    return _ev(tree)


def _num(x):
    if isinstance(x, bool): return int(x)
    if isinstance(x, (int, float)): return x
    if isinstance(x, str):
        try: return float(x)
        except ValueError: return 0
    return 0


def _replace_word(s: str, word: str, replacement: str) -> str:
    import re
    return re.sub(rf"\b{re.escape(word)}\b", replacement, s)
