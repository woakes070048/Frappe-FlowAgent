# Copyright (c) 2026, FlowAgent and contributors
# For license information, please see license.txt
"""
Trigger nodes.

At execution time, a trigger is just an entry point: the actual
triggering happened upstream (DocType event, cron tick, webhook hit).
The trigger node's job here is simply to expose the inbound payload as
context variables. Whatever the trigger source put under `payload` is
already in the context — the trigger node primarily acts as a labelled
DAG root and a place to declare expectations.
"""

from __future__ import annotations

from . import BaseExecutor, node


@node("trigger_doctype")
class DocTypeTrigger(BaseExecutor):
    def run(self, *, node, cfg, context, runner):
        # Payload was injected by the dispatcher. We just acknowledge it.
        return {
            "doctype": cfg.get("doctype"),
            "event": cfg.get("event"),
            "doc": context.get("doc"),
        }


@node("trigger_webhook")
class WebhookTrigger(BaseExecutor):
    def run(self, *, node, cfg, context, runner):
        return {
            "path": cfg.get("path"),
            "body": context.get("body"),
            "headers": context.get("headers"),
        }


@node("trigger_schedule")
class ScheduleTrigger(BaseExecutor):
    def run(self, *, node, cfg, context, runner):
        return {"cron": cfg.get("cron"), "tick_at": context.get("tick_at")}


@node("trigger_manual")
class ManualTrigger(BaseExecutor):
    def run(self, *, node, cfg, context, runner):
        return {"user": runner.user, "payload": context.get("trigger")}
