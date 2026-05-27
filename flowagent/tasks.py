# Copyright (c) 2026, FlowAgent and contributors
# For license information, please see license.txt
"""
Scheduled housekeeping.
"""

from __future__ import annotations

from datetime import timedelta

import frappe
from frappe.utils import now_datetime


def cleanup_old_runs():
    """Delete Workflow Run history older than the configured retention."""
    settings = frappe.get_single("FlowAgent Settings")
    days = int(settings.run_retention_days or 30)
    if days <= 0:
        return  # 0 = keep forever
    cutoff = now_datetime() - timedelta(days=days)
    old = frappe.get_all(
        "FlowAgent Workflow Run",
        filters={"creation": ("<", cutoff)},
        pluck="name",
        limit=500,  # cap per tick to keep this cheap
    )
    for name in old:
        try:
            frappe.delete_doc(
                "FlowAgent Workflow Run", name,
                ignore_permissions=True, force=True, delete_permanently=True,
            )
        except Exception:
            # Skip stuck rows; next tick will try again
            continue
    if old:
        frappe.db.commit()
