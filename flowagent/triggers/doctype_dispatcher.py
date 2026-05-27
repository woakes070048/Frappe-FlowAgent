# Copyright (c) 2026, FlowAgent and contributors
# For license information, please see license.txt
"""
DocType event → workflow dispatch.

This module is wired via the `doc_events` wildcard in hooks.py. Every
single doctype save/submit/cancel/etc. flows through `on_event`. To stay
cheap, the dispatcher does an indexed lookup against the
`FlowAgent Workflow Trigger Index` table (which is maintained whenever
a workflow is saved) and bails out immediately if nothing matches.
"""

from __future__ import annotations

import json

import frappe


# Map Frappe's lifecycle hook names to our friendlier event labels.
_EVENT_MAP = {
    "after_insert": "After Insert",
    "on_update": "After Save",
    "on_submit": "After Submit",
    "on_cancel": "After Cancel",
    "on_trash": "After Delete",
    "on_change": "On Change",
}


def on_event(doc, method=None):
    """Wildcard doc_events handler.

    Called for every doctype event. We do the cheapest possible filter
    here — if no workflow listens for this (doctype, event) pair, return
    in <1ms.
    """
    event = _EVENT_MAP.get(method)
    if not event:
        return

    # Skip our own doctypes to avoid feedback loops (a workflow run
    # creating Workflow Run docs could otherwise re-trigger workflows).
    if doc.doctype.startswith("FlowAgent Workflow") or doc.doctype == "FlowAgent Settings":
        return

    # Cheap index lookup
    workflows = frappe.get_all(
        "FlowAgent Workflow Trigger Index",
        filters={"trigger_doctype": doc.doctype, "trigger_event": event},
        pluck="workflow",
    )
    if not workflows:
        return

    for wf_name in workflows:
        _dispatch_one(wf_name, doc, event)


def _dispatch_one(wf_name: str, doc, event: str):
    """Enqueue a workflow run for this doc event."""
    # Evaluate the optional trigger condition before spending an enqueue slot
    wf = frappe.get_cached_doc("FlowAgent Workflow", wf_name)
    if not wf.enabled:
        return

    if wf.trigger_condition:
        try:
            if not _eval_condition(wf.trigger_condition, doc):
                return
        except Exception as e:
            frappe.log_error(
                title=f"FlowAgent: trigger condition error on {wf_name}",
                message=f"{type(e).__name__}: {e}\n\nCondition:\n{wf.trigger_condition}",
            )
            return

    payload = _build_payload(doc, event)

    # Enqueue in the background — we don't want to block the user's save
    # on a slow webhook or LLM call.
    frappe.enqueue(
        "flowagent.engine.run_workflow_background",
        queue="default",
        timeout=600,
        workflow_name=wf_name,
        trigger_source=f"doctype:{doc.doctype}/{event}",
        payload=payload,
        user=frappe.session.user,
    )


def _build_payload(doc, event: str) -> dict:
    """Serialise the doc into a payload that the workflow can consume."""
    return {
        "doc": doc.as_dict(no_default_fields=False),
        "doc_name": doc.name,
        "doctype": doc.doctype,
        "event": event,
        "user": frappe.session.user,
    }


def _eval_condition(expr: str, doc) -> bool:
    """Evaluate the trigger_condition Python expression.

    Uses Frappe's safe_exec so user-authored conditions can't do
    arbitrary IO. Conditions should assign to `result` or be a single
    expression that the safe evaluator can read.
    """
    from frappe.utils.safe_exec import safe_exec

    local = {"doc": doc, "result": None}
    # Wrap a bare expression so safe_exec captures it
    code = expr if "result" in expr or "\n" in expr else f"result = bool({expr})"
    safe_exec(code, _locals=local)
    return bool(local.get("result"))
