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
    frappe.db.commit()


def after_migrate():
    """Run after every `bench migrate` — idempotent."""
    _ensure_role()
    _ensure_settings()
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
