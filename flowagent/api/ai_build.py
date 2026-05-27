# Copyright (c) 2026, FlowAgent and contributors
# For license information, please see license.txt
"""
AI Build: natural language → workflow graph.

Called from the Studio's "AI Build" sidebar. The user types something
like "When a Sales Invoice is submitted, extract key data with AI, check
if amount > 50000, then send a WhatsApp approval request" and we return
a workflow JSON that the canvas drops directly onto the screen.

This is server-side rather than browser-side because the API key cannot
leak to the client. The Anthropic call carries a strict system prompt
listing valid node types and a JSON schema for the response.
"""

from __future__ import annotations

import json
import re

import frappe


# Keep this list in sync with engine/nodes/__init__.py - all_node_types()
VALID_NODE_TYPES = [
    "trigger_doctype", "trigger_webhook", "trigger_schedule", "trigger_manual",
    "ai_llm", "ai_extract", "ai_classify", "ai_sentiment", "ai_agent", "ai_vision",
    "logic_condition", "logic_loop", "logic_wait", "logic_parallel",
    "frappe_create", "frappe_update", "frappe_fetch", "frappe_submit", "frappe_script",
    "int_email", "int_whatsapp", "int_http", "int_slack", "int_sheets", "int_razorpay",
    "tf_mapper", "tf_jinja", "tf_code",
]


SYSTEM_PROMPT = f"""You are a workflow builder for FlowAgent, a visual automation tool for Frappe / ERPNext. The user describes a workflow in plain English. You translate that into a JSON workflow graph.

OUTPUT FORMAT — return ONLY valid JSON, no markdown fences, no prose:

{{
  "workflow_name": "Short Title Case Name",
  "description": "one sentence",
  "trigger": {{
    "type": "DocType Event" | "Schedule" | "Webhook" | "Manual",
    "doctype": "Sales Invoice",       // if DocType Event
    "event": "After Submit",          // if DocType Event: After Insert | After Save | After Submit | After Cancel | After Delete | On Change
    "cron": "0 9 * * *"               // if Schedule
  }},
  "nodes": [
    {{
      "id": "n1",
      "type": "trigger_doctype",
      "x": 30, "y": 120,
      "cfg": {{ "doctype": "Sales Invoice", "event": "After Submit" }}
    }},
    ...
  ],
  "edges": [
    {{ "from": "n1", "to": "n2" }},
    {{ "from": "n3", "to": "n4", "fromPort": "out-yes" }},
    {{ "from": "n3", "to": "n5", "fromPort": "out-no" }}
  ]
}}

VALID NODE TYPES:
{', '.join(VALID_NODE_TYPES)}

LAYOUT RULES:
- Place nodes left-to-right: x starts at 30, increment by ~200 per column
- y centered around 150; stagger to ~80 and ~220 for parallel branches
- Use string IDs like "n1", "n2", ...

CONFIG GUIDANCE (cfg fields per node type):
- trigger_doctype: doctype, event
- trigger_schedule: cron
- ai_llm: prompt, output (variable name)
- ai_extract: source (Jinja, defaults to last output), fields (comma list or JSON), output
- ai_classify: text, categories (csv), output
- ai_agent: task, allowed_doctypes (csv), can_write (bool), output
- logic_condition: expr (e.g. "amount > 50000" or "{{{{extracted.score}}}} == 'hot'")
- logic_wait: seconds
- frappe_create: doctype, values (JSON string)
- frappe_update: doctype, name, fields (JSON string)
- frappe_fetch: doctype, filters (JSON), fields, limit, output
- int_email: to, subject, body
- int_whatsapp: to, message
- int_slack: channel, message
- int_http: url, method, body
- tf_jinja: template, output

JINJA: Reference upstream node outputs via {{{{output_var}}}} or {{{{trigger.field}}}}. Anything saved under an "output" cfg key is available downstream.

WIRING:
- Branching nodes (logic_condition) must have TWO outgoing edges with fromPort="out-yes" and "out-no"
- All other nodes have a single outgoing edge (no fromPort needed)
- The trigger node must be node 0 / "n1"

Return only the JSON object. Nothing before, nothing after."""


@frappe.whitelist()
def build_from_prompt(prompt: str, model: str | None = None):
    """Convert a NL workflow description into a graph JSON."""
    if not (
        "System Manager" in frappe.get_roles()
        or "FlowAgent Manager" in frappe.get_roles()
    ):
        frappe.throw("Not permitted", frappe.PermissionError)

    from ..flowagent_core.doctype.flowagent_settings.flowagent_settings import (
        get_anthropic_key, get_default_model,
    )
    try:
        from anthropic import Anthropic
    except ImportError:
        frappe.throw("Install the anthropic package: pip install anthropic")

    key = get_anthropic_key()
    if not key:
        frappe.throw("Set the Anthropic API key in FlowAgent Settings before using AI Build")

    client = Anthropic(api_key=key)
    response = client.messages.create(
        model=model or get_default_model(),
        max_tokens=2000,
        system=SYSTEM_PROMPT,
        messages=[{"role": "user", "content": prompt}],
    )
    raw = "".join(b.text for b in response.content if getattr(b, "type", None) == "text").strip()

    # Strip code fences if the model produced them despite instructions
    cleaned = _strip_fences(raw)
    try:
        parsed = json.loads(cleaned)
    except json.JSONDecodeError as e:
        # Last-ditch: find the first {...} balanced block
        m = re.search(r"\{.*\}", cleaned, re.DOTALL)
        if not m:
            frappe.throw(f"AI returned non-JSON: {raw[:300]}")
        parsed = json.loads(m.group(0))

    # Light validation — drop unknown node types so the canvas doesn't blow up
    parsed["nodes"] = [n for n in parsed.get("nodes", []) if n.get("type") in VALID_NODE_TYPES]
    return parsed


def _strip_fences(s: str) -> str:
    s = s.strip()
    s = re.sub(r"^```(?:json)?\s*", "", s)
    s = re.sub(r"\s*```\s*$", "", s)
    return s.strip()
