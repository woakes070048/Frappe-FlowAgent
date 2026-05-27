# Copyright (c) 2026, FlowAgent and contributors
# For license information, please see license.txt
"""
Whitelisted methods exposed to the FlowAgent Studio frontend.

All methods require System Manager OR FlowAgent Manager.
"""

from __future__ import annotations

import json

import frappe
from frappe.utils import cint


def _check_perm():
    if not (
        "System Manager" in frappe.get_roles()
        or "FlowAgent Manager" in frappe.get_roles()
    ):
        frappe.throw("Not permitted", frappe.PermissionError)


# -------------------------------------------------------------------------
# Workflow CRUD
# -------------------------------------------------------------------------
@frappe.whitelist()
def list_workflows():
    """Sidebar list of workflows."""
    _check_perm()
    return frappe.get_all(
        "FlowAgent Workflow",
        fields=["name", "workflow_name", "enabled", "trigger_type",
                "trigger_doctype", "last_run_status", "total_runs",
                "modified", "tags"],
        order_by="modified desc",
        limit=200,
    )


@frappe.whitelist()
def load_workflow(name: str):
    """Hydrate a workflow for the canvas."""
    _check_perm()
    doc = frappe.get_doc("FlowAgent Workflow", name)
    return {
        "name": doc.name,
        "workflow_name": doc.workflow_name,
        "enabled": bool(doc.enabled),
        "description": doc.description,
        "trigger": {
            "type": doc.trigger_type,
            "doctype": doc.trigger_doctype,
            "event": doc.trigger_event,
            "cron": doc.trigger_cron,
            "condition": doc.trigger_condition,
        },
        "nodes": doc.get_nodes(),
        "edges": doc.get_edges(),
        "viewport": _json_or_default(doc.viewport_json, {"x": 0, "y": 0, "zoom": 1}),
        "runtime": {
            "on_error": doc.on_error,
            "max_retries": doc.max_retries,
            "log_level": doc.log_level,
        },
        "stats": {
            "total_runs": doc.total_runs,
            "last_run_status": doc.last_run_status,
            "last_run_at": str(doc.last_run_at) if doc.last_run_at else None,
        },
        "webhook_path": doc.webhook_path,
    }


@frappe.whitelist()
def save_workflow(payload: str):
    """Save (create or update) a workflow from canvas state."""
    _check_perm()
    data = json.loads(payload) if isinstance(payload, str) else payload

    name = data.get("name") or data.get("workflow_name")
    if not name:
        frappe.throw("workflow_name is required")

    existing = frappe.db.exists("FlowAgent Workflow", name)
    if existing:
        doc = frappe.get_doc("FlowAgent Workflow", existing)
    else:
        doc = frappe.new_doc("FlowAgent Workflow")
        doc.workflow_name = name

    # Renames are handled by changing workflow_name to a different value
    new_name = data.get("workflow_name")
    if new_name and new_name != doc.workflow_name:
        doc.workflow_name = new_name

    doc.description = data.get("description") or ""
    doc.enabled = 1 if data.get("enabled") else 0

    trig = data.get("trigger") or {}
    doc.trigger_type = trig.get("type") or "Manual"
    doc.trigger_doctype = trig.get("doctype")
    doc.trigger_event = trig.get("event")
    doc.trigger_cron = trig.get("cron")
    doc.trigger_condition = trig.get("condition")

    doc.nodes_json = json.dumps(data.get("nodes") or [])
    doc.edges_json = json.dumps(data.get("edges") or [])
    doc.viewport_json = json.dumps(data.get("viewport") or {})

    runtime = data.get("runtime") or {}
    doc.on_error = runtime.get("on_error") or "Stop"
    doc.max_retries = cint(runtime.get("max_retries") or 0)
    doc.log_level = runtime.get("log_level") or "Info"
    doc.tags = data.get("tags")

    doc.flags.ignore_permissions = False
    doc.save()
    frappe.db.commit()
    return {"name": doc.name, "modified": str(doc.modified)}


@frappe.whitelist()
def delete_workflow(name: str):
    _check_perm()
    frappe.delete_doc("FlowAgent Workflow", name)
    frappe.db.commit()
    return {"deleted": name}


# -------------------------------------------------------------------------
# Running & runs
# -------------------------------------------------------------------------
@frappe.whitelist()
def run_workflow_now(name: str, payload: str | None = None, sync: int = 0):
    """Manually fire a workflow.

    sync=1 → run in this request and return the full result (good for the
              Studio's Run button so users see traces immediately).
    sync=0 → enqueue and return the queued run name.
    """
    _check_perm()
    parsed_payload = {}
    if payload:
        try:
            parsed_payload = json.loads(payload) if isinstance(payload, str) else payload
        except json.JSONDecodeError:
            frappe.throw("payload must be valid JSON")

    if cint(sync):
        from ..engine.runner import Runner
        run_name = Runner(
            workflow_name=name,
            trigger_source="studio_manual",
            payload=parsed_payload,
            user=frappe.session.user,
        ).execute()
        return get_run(run_name)

    # Async enqueue
    frappe.enqueue(
        "flowagent.engine.run_workflow_background",
        queue="default",
        timeout=600,
        workflow_name=name,
        trigger_source="studio_manual",
        payload=parsed_payload,
        user=frappe.session.user,
    )
    return {"queued": True}


@frappe.whitelist()
def get_run(run_name: str):
    """Return a single run with its full step trace."""
    _check_perm()
    doc = frappe.get_doc("FlowAgent Workflow Run", run_name)
    return {
        "name": doc.name,
        "workflow": doc.workflow,
        "status": doc.status,
        "trigger_source": doc.trigger_source,
        "started_at": str(doc.started_at) if doc.started_at else None,
        "ended_at": str(doc.ended_at) if doc.ended_at else None,
        "duration_ms": doc.duration_ms,
        "trigger_payload": _json_or_default(doc.trigger_payload, {}),
        "final_context": _json_or_default(doc.final_context, {}),
        "error_message": doc.error_message,
        "steps": [
            {
                "step_index": s.step_index,
                "node_id": s.node_id,
                "node_type": s.node_type,
                "node_label": s.node_label,
                "status": s.status,
                "duration_ms": s.duration_ms,
                "input": _json_or_default(s.input_snapshot, None),
                "output": _json_or_default(s.output_snapshot, None),
                "error": s.error,
            }
            for s in doc.steps
        ],
    }


@frappe.whitelist()
def recent_runs(workflow: str | None = None, limit: int = 20):
    """Recent runs for the Stats / log panel."""
    _check_perm()
    filters = {}
    if workflow:
        filters["workflow"] = workflow
    return frappe.get_all(
        "FlowAgent Workflow Run",
        filters=filters,
        fields=["name", "workflow", "status", "trigger_source",
                "started_at", "duration_ms"],
        order_by="creation desc",
        limit=cint(limit),
    )


@frappe.whitelist()
def workflow_stats(workflow: str | None = None):
    """Aggregate stats for the Studio's Stats tab."""
    _check_perm()
    filters = {}
    if workflow:
        filters["workflow"] = workflow
    total = frappe.db.count("FlowAgent Workflow Run", filters)
    ok = frappe.db.count("FlowAgent Workflow Run", {**filters, "status": "Success"})
    err = frappe.db.count(
        "FlowAgent Workflow Run",
        {**filters, "status": ("in", ["Failed", "Timeout"])},
    )
    avg_ms = frappe.db.sql(
        "SELECT AVG(duration_ms) FROM `tabFlowAgent Workflow Run` "
        "WHERE status='Success'"
        + (" AND workflow=%s" if workflow else ""),
        (workflow,) if workflow else (),
    )
    avg = int(avg_ms[0][0] or 0) if avg_ms else 0
    return {"runs": total, "ok": ok, "err": err, "avg_ms": avg}


# -------------------------------------------------------------------------
# Helpers
# -------------------------------------------------------------------------
def _json_or_default(raw, default):
    if not raw:
        return default
    try:
        return json.loads(raw)
    except (TypeError, ValueError):
        return default
