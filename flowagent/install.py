# Copyright (c) 2026, FlowAgent and contributors
# For license information, please see license.txt
"""
Post-install / post-migrate hooks.

We ensure the FlowAgent Settings single exists and seed a couple of
example workflows so a fresh install isn't an empty canvas.
"""

import frappe


def after_install():
    """Run once after `bench install-app flowagent`."""
    _ensure_role()
    _ensure_settings()
    _refresh_workspace()
    frappe.db.commit()


def after_migrate():
    """Run after every `bench migrate` — idempotent."""
    _ensure_role()
    _ensure_settings()
    _refresh_workspace()
    frappe.db.commit()


def _ensure_role():
    if not frappe.db.exists("Role", "FlowAgent Manager"):
        role = frappe.new_doc("Role")
        role.role_name = "FlowAgent Manager"
        role.desk_access = 1
        role.flags.ignore_permissions = True
        role.insert(ignore_permissions=True)


def _ensure_settings():
    if not frappe.db.exists("FlowAgent Settings", "FlowAgent Settings"):
        doc = frappe.new_doc("FlowAgent Settings")
        doc.default_model = "claude-sonnet-4-5"
        doc.max_steps_per_run = 100
        doc.max_agent_iterations = 8
        doc.run_retention_days = 30
        doc.webhook_secret = frappe.generate_hash(length=32)
        doc.flags.ignore_permissions = True
        doc.flags.ignore_mandatory = True
        doc.insert(ignore_permissions=True)


def _refresh_workspace():
    """Re-import the FlowAgent workspace from disk on every migrate.

    Why: Frappe's standard workspace sync during migrate preserves user
    edits, which is normally what you want — but here we ship layout
    updates with new releases (number cards, charts, links to reports)
    and want users on a fresh upgrade to see them.

    We only force-refresh `is_standard=1` workspaces with no `for_user`
    set — never touch a workspace someone has customised as their own.
    """
    try:
        if frappe.db.exists("Workspace", "FlowAgent"):
            ws_info = frappe.db.get_value(
                "Workspace", "FlowAgent",
                ["for_user", "is_standard"], as_dict=True,
            ) or {}
            if not ws_info.get("for_user") and ws_info.get("is_standard"):
                frappe.delete_doc(
                    "Workspace", "FlowAgent",
                    ignore_permissions=True, force=True,
                )

        # Re-import from disk so the new layout takes effect immediately,
        # without waiting for another migrate cycle.
        import os
        from frappe.modules.import_file import import_file_by_path
        ws_path = os.path.join(
            frappe.get_app_path("flowagent"),
            "flowagent_core", "workspace", "flowagent", "flowagent.json",
        )
        if os.path.exists(ws_path):
            import_file_by_path(ws_path, force=True)
    except Exception as e:
        # Workspace refresh is best-effort; never let it break migrate.
        frappe.log_error(
            title="FlowAgent: workspace refresh skipped",
            message=f"{type(e).__name__}: {e}",
        )
