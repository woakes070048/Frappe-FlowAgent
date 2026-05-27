// Copyright (c) 2026, FlowAgent and contributors
// For license information, please see license.txt
//
// FlowAgent Studio client-side bundle.
//
// This file is loaded on every Desk page via `app_include_js` in hooks.py.
// It's a no-op outside the Studio page; on that page it provides:
//   * the HTML scaffolding (window.flowagent_studio_html)
//   * the canvas + interactions  (window.flowagent_studio_init)
//
// We deliberately keep this in plain ES, no framework, so it works in
// vanilla Frappe Desk without a build step.

(function () {
'use strict';

// ============================================================
// Node definitions — mirror your canvas mockup
// ============================================================
const NODE_DEFS = {
    // ----- triggers -----
    trigger_doctype: {
        label: 'DocType Event', icon: 'ti-bolt', color: '#EEEDFE', iconColor: '#534AB7',
        category: 'trigger', fields: [
            { k: 'doctype', l: 'DocType', t: 'link', options: 'DocType', v: 'Sales Invoice' },
            { k: 'event', l: 'Event', t: 'select',
              opts: ['After Insert', 'After Save', 'After Submit', 'After Cancel', 'After Delete', 'On Change'],
              v: 'After Submit' },
        ],
    },
    trigger_webhook: {
        label: 'Webhook', icon: 'ti-webhook', color: '#EEEDFE', iconColor: '#534AB7',
        category: 'trigger', fields: [
            { k: 'path', l: 'Path (auto)', t: 'text', v: '', readonly: true },
        ],
    },
    trigger_schedule: {
        label: 'Schedule', icon: 'ti-clock', color: '#EEEDFE', iconColor: '#534AB7',
        category: 'trigger', fields: [
            { k: 'cron', l: 'Cron expression', t: 'text', v: '0 9 * * *' },
        ],
    },
    trigger_manual: {
        label: 'Manual', icon: 'ti-hand-click', color: '#EEEDFE', iconColor: '#534AB7',
        category: 'trigger', fields: [],
    },

    // ----- AI -----
    ai_llm: {
        label: 'LLM Prompt', icon: 'ti-sparkles', color: '#EAF3DE', iconColor: '#1D9E75',
        category: 'ai', fields: [
            { k: 'prompt', l: 'Prompt', t: 'textarea', v: 'Summarize: {{trigger.doc}}' },
            { k: 'system', l: 'System prompt (optional)', t: 'textarea', v: '' },
            { k: 'model', l: 'Model (optional)', t: 'text', v: '' },
            { k: 'output', l: 'Output variable', t: 'text', v: 'llm_output' },
        ],
    },
    ai_extract: {
        label: 'AI Extractor', icon: 'ti-list-search', color: '#EAF3DE', iconColor: '#1D9E75',
        category: 'ai', fields: [
            { k: 'source', l: 'Source text', t: 'textarea', v: '{{trigger.doc}}' },
            { k: 'fields', l: 'Fields (csv or JSON map)', t: 'textarea',
              v: 'amount, customer, line_items' },
            { k: 'output', l: 'Output variable', t: 'text', v: 'extracted' },
        ],
    },
    ai_classify: {
        label: 'Classifier', icon: 'ti-category', color: '#EAF3DE', iconColor: '#1D9E75',
        category: 'ai', fields: [
            { k: 'text', l: 'Input text', t: 'textarea', v: '{{trigger.doc}}' },
            { k: 'categories', l: 'Categories (csv)', t: 'text', v: 'hot, warm, cold' },
            { k: 'instructions', l: 'Extra instructions', t: 'textarea', v: '' },
            { k: 'output', l: 'Output variable', t: 'text', v: 'category' },
        ],
    },
    ai_sentiment: {
        label: 'Sentiment', icon: 'ti-mood-smile', color: '#EAF3DE', iconColor: '#1D9E75',
        category: 'ai', fields: [
            { k: 'text', l: 'Input text', t: 'textarea', v: '' },
            { k: 'output', l: 'Output variable', t: 'text', v: 'sentiment' },
        ],
    },
    ai_agent: {
        label: 'Auto Agent', icon: 'ti-robot', color: '#EAF3DE', iconColor: '#1D9E75',
        category: 'ai', fields: [
            { k: 'task', l: 'Task (natural language)', t: 'textarea',
              v: 'Find all open Sales Invoices for customer {{customer}} and summarise them.' },
            { k: 'allowed_doctypes', l: 'Allowed DocTypes (csv)', t: 'text',
              v: 'Sales Invoice, Customer' },
            { k: 'can_write', l: 'Allow writes', t: 'select', opts: ['false', 'true'], v: 'false' },
            { k: 'max_iters', l: 'Max iterations', t: 'text', v: '8' },
            { k: 'output', l: 'Output variable', t: 'text', v: 'agent_result' },
        ],
    },
    ai_vision: {
        label: 'Vision/OCR', icon: 'ti-eye', color: '#EAF3DE', iconColor: '#1D9E75',
        category: 'ai', fields: [
            { k: 'file_url', l: 'File URL', t: 'text', v: '{{trigger.doc.file_url}}' },
            { k: 'prompt', l: 'Instruction', t: 'textarea',
              v: 'Extract all text and key fields from this image.' },
            { k: 'output', l: 'Output variable', t: 'text', v: 'vision_result' },
        ],
    },

    // ----- logic -----
    logic_condition: {
        label: 'Condition', icon: 'ti-git-fork', color: '#FAEEDA', iconColor: '#BA7517',
        category: 'logic', hasBranch: true, fields: [
            { k: 'expr', l: 'Expression', t: 'textarea', v: '{{extracted.amount}} > 50000' },
        ],
    },
    logic_loop: {
        label: 'Loop', icon: 'ti-refresh', color: '#FAEEDA', iconColor: '#BA7517',
        category: 'logic', fields: [
            { k: 'items', l: 'Items (Jinja → list)', t: 'text', v: '{{ items_list }}' },
            { k: 'item_var', l: 'Item variable', t: 'text', v: 'item' },
            { k: 'max_items', l: 'Max items', t: 'text', v: '100' },
        ],
    },
    logic_wait: {
        label: 'Wait / Delay', icon: 'ti-hourglass', color: '#FAEEDA', iconColor: '#BA7517',
        category: 'logic', fields: [
            { k: 'seconds', l: 'Seconds (≤60 for sync runs)', t: 'text', v: '5' },
        ],
    },
    logic_parallel: {
        label: 'Parallel', icon: 'ti-arrows-split', color: '#FAEEDA', iconColor: '#BA7517',
        category: 'logic', fields: [],
    },

    // ----- frappe -----
    frappe_create: {
        label: 'Create Doc', icon: 'ti-file-plus', color: '#E6F1FB', iconColor: '#185FA5',
        category: 'frappe', fields: [
            { k: 'doctype', l: 'DocType', t: 'link', options: 'DocType', v: 'ToDo' },
            { k: 'values', l: 'Values (JSON)', t: 'textarea',
              v: '{"description": "Review {{trigger.doc.name}}"}' },
        ],
    },
    frappe_update: {
        label: 'Update Doc', icon: 'ti-edit', color: '#E6F1FB', iconColor: '#185FA5',
        category: 'frappe', fields: [
            { k: 'doctype', l: 'DocType', t: 'link', options: 'DocType', v: 'Sales Invoice' },
            { k: 'name', l: 'Document name', t: 'text', v: '{{trigger.doc.name}}' },
            { k: 'fields', l: 'Fields (JSON)', t: 'textarea',
              v: '{"custom_ai_status": "Processed"}' },
        ],
    },
    frappe_fetch: {
        label: 'Fetch Doc', icon: 'ti-database-search', color: '#E6F1FB', iconColor: '#185FA5',
        category: 'frappe', fields: [
            { k: 'doctype', l: 'DocType', t: 'link', options: 'DocType', v: 'Sales Invoice' },
            { k: 'name', l: 'Single name (optional)', t: 'text', v: '' },
            { k: 'filters', l: 'Filters (JSON)', t: 'textarea',
              v: '{"docstatus": 1, "status": "Overdue"}' },
            { k: 'fields', l: 'Fields (csv)', t: 'text', v: 'name, customer, grand_total' },
            { k: 'limit', l: 'Limit', t: 'text', v: '20' },
            { k: 'output', l: 'Output variable', t: 'text', v: 'rows' },
        ],
    },
    frappe_submit: {
        label: 'Submit Doc', icon: 'ti-file-check', color: '#E6F1FB', iconColor: '#185FA5',
        category: 'frappe', fields: [
            { k: 'doctype', l: 'DocType', t: 'link', options: 'DocType', v: 'Purchase Invoice' },
            { k: 'name', l: 'Document name', t: 'text', v: '{{doc_name}}' },
        ],
    },
    frappe_script: {
        label: 'Server Script', icon: 'ti-code', color: '#E6F1FB', iconColor: '#185FA5',
        category: 'frappe', fields: [
            { k: 'script', l: 'Python', t: 'textarea',
              v: 'result = frappe.db.get_value("Customer", "Acme", "credit_limit")' },
        ],
    },

    // ----- integrations -----
    int_email: {
        label: 'Send Email', icon: 'ti-mail', color: '#FAECE7', iconColor: '#993C1D',
        category: 'integration', fields: [
            { k: 'to', l: 'To', t: 'text', v: '{{trigger.doc.contact_email}}' },
            { k: 'subject', l: 'Subject', t: 'text', v: 'Invoice {{trigger.doc.name}}' },
            { k: 'body', l: 'Body (HTML / Jinja)', t: 'textarea',
              v: 'Dear {{trigger.doc.customer_name}},\n\n{{llm_output}}' },
        ],
    },
    int_whatsapp: {
        label: 'WhatsApp', icon: 'ti-brand-whatsapp', color: '#FAECE7', iconColor: '#993C1D',
        category: 'integration', fields: [
            { k: 'to', l: 'Phone number', t: 'text', v: '{{trigger.doc.mobile_no}}' },
            { k: 'message', l: 'Message', t: 'textarea',
              v: 'Hi {{trigger.doc.customer_name}}, invoice {{trigger.doc.name}} requires approval.' },
        ],
    },
    int_http: {
        label: 'HTTP Request', icon: 'ti-api', color: '#FAECE7', iconColor: '#993C1D',
        category: 'integration', fields: [
            { k: 'url', l: 'URL', t: 'text', v: 'https://api.example.com/notify' },
            { k: 'method', l: 'Method', t: 'select', opts: ['POST', 'GET', 'PUT', 'PATCH', 'DELETE'], v: 'POST' },
            { k: 'headers', l: 'Headers (JSON)', t: 'textarea', v: '{}' },
            { k: 'body', l: 'Body (JSON / Jinja)', t: 'textarea',
              v: '{"ref": "{{trigger.doc.name}}"}' },
        ],
    },
    int_slack: {
        label: 'Slack', icon: 'ti-brand-slack', color: '#FAECE7', iconColor: '#993C1D',
        category: 'integration', fields: [
            { k: 'channel', l: 'Channel', t: 'text', v: '#sales-alerts' },
            { k: 'message', l: 'Message', t: 'textarea',
              v: 'New lead *{{lead_name}}* classified as *{{category}}*' },
        ],
    },
    int_sheets: {
        label: 'Google Sheets', icon: 'ti-table', color: '#FAECE7', iconColor: '#993C1D',
        category: 'integration', fields: [
            { k: 'sheet_id', l: 'Sheet ID', t: 'text', v: '' },
            { k: 'range', l: 'Range', t: 'text', v: 'Sheet1!A:Z' },
            { k: 'action', l: 'Action', t: 'select',
              opts: ['Append row', 'Update row', 'Read range'], v: 'Append row' },
            { k: 'values', l: 'Row values (JSON array)', t: 'textarea',
              v: '["{{trigger.doc.name}}", "{{trigger.doc.customer_name}}"]' },
        ],
    },
    int_razorpay: {
        label: 'Razorpay', icon: 'ti-credit-card', color: '#FAECE7', iconColor: '#993C1D',
        category: 'integration', fields: [
            { k: 'action', l: 'Action', t: 'select',
              opts: ['Create order', 'Fetch payment', 'Create link'], v: 'Create order' },
            { k: 'amount', l: 'Amount (paise)', t: 'text', v: '{{trigger.doc.grand_total * 100}}' },
            { k: 'currency', l: 'Currency', t: 'text', v: 'INR' },
            { k: 'receipt', l: 'Receipt', t: 'text', v: '{{trigger.doc.name}}' },
        ],
    },

    // ----- transforms -----
    tf_mapper: {
        label: 'Field Mapper', icon: 'ti-arrows-exchange', color: '#F1EFE8', iconColor: '#5F5E5A',
        category: 'transform', fields: [
            { k: 'mapping', l: 'Mapping (JSON of templates)', t: 'textarea',
              v: '{"out_field": "{{in_field}}"}' },
        ],
    },
    tf_jinja: {
        label: 'Jinja Template', icon: 'ti-braces', color: '#F1EFE8', iconColor: '#5F5E5A',
        category: 'transform', fields: [
            { k: 'template', l: 'Template', t: 'textarea',
              v: 'Hello {{ customer_name }}, your order {{ order_id }} is ready.' },
            { k: 'output', l: 'Output variable', t: 'text', v: 'rendered' },
        ],
    },
    tf_code: {
        label: 'Python Code', icon: 'ti-brand-python', color: '#F1EFE8', iconColor: '#5F5E5A',
        category: 'transform', fields: [
            { k: 'code', l: 'Python', t: 'textarea',
              v: 'output = {k: v for k, v in input.items() if v}' },
            { k: 'output', l: 'Output variable', t: 'text', v: 'output' },
        ],
    },
};

const SIDEBAR_GROUPS = [
    { label: 'Triggers',         types: ['trigger_doctype', 'trigger_webhook', 'trigger_schedule', 'trigger_manual'] },
    { label: 'AI Agents',        types: ['ai_llm', 'ai_extract', 'ai_classify', 'ai_sentiment', 'ai_agent', 'ai_vision'] },
    { label: 'Logic',            types: ['logic_condition', 'logic_loop', 'logic_wait', 'logic_parallel'] },
    { label: 'Frappe Actions',   types: ['frappe_create', 'frappe_update', 'frappe_fetch', 'frappe_submit', 'frappe_script'] },
    { label: 'Integrations',     types: ['int_email', 'int_whatsapp', 'int_http', 'int_slack', 'int_sheets', 'int_razorpay'] },
    { label: 'Transform',        types: ['tf_mapper', 'tf_jinja', 'tf_code'] },
];

const CATEGORY_DOT = {
    trigger: '#534AB7', ai: '#1D9E75', logic: '#BA7517',
    frappe: '#185FA5', integration: '#D85A30', transform: '#888780',
};

// ============================================================
// Templates (preset workflows)
// ============================================================
const TEMPLATES = {
    invoice_approval: {
        name: 'Invoice Approval',
        nodes: [
            { t: 'trigger_doctype', cfg: { doctype: 'Sales Invoice', event: 'After Submit' } },
            { t: 'ai_extract', cfg: { source: '{{trigger.doc}}', fields: 'amount, customer, line_items', output: 'extracted' } },
            { t: 'logic_condition', cfg: { expr: '{{extracted.amount}} > 50000' } },
            { t: 'int_whatsapp', cfg: { to: '{{trigger.doc.contact_mobile}}', message: 'Invoice approval needed: ₹{{extracted.amount}}' } },
            { t: 'frappe_update', cfg: { doctype: 'Sales Invoice', name: '{{trigger.doc.name}}', fields: '{"custom_ai_status":"Processed"}' } },
        ],
        trigger: { type: 'DocType Event', doctype: 'Sales Invoice', event: 'After Submit' },
    },
    lead_qualify: {
        name: 'Lead Auto-Qualify',
        nodes: [
            { t: 'trigger_doctype', cfg: { doctype: 'Lead', event: 'After Insert' } },
            { t: 'ai_classify', cfg: { text: '{{trigger.doc.lead_name}} {{trigger.doc.notes}}', categories: 'hot, warm, cold', output: 'category' } },
            { t: 'frappe_update', cfg: { doctype: 'Lead', name: '{{trigger.doc.name}}', fields: '{"custom_lead_score":"{{category}}"}' } },
            { t: 'int_slack', cfg: { channel: '#sales', message: 'Lead {{trigger.doc.lead_name}} = {{category}}' } },
        ],
        trigger: { type: 'DocType Event', doctype: 'Lead', event: 'After Insert' },
    },
    daily_digest: {
        name: 'Daily Overdue Digest',
        nodes: [
            { t: 'trigger_schedule', cfg: { cron: '0 9 * * *' } },
            { t: 'frappe_fetch', cfg: { doctype: 'Sales Invoice', filters: '{"status":"Overdue"}', fields: 'name, customer, grand_total', limit: '50', output: 'invoices' } },
            { t: 'ai_llm', cfg: { prompt: 'Write a 3-line summary of these overdue invoices: {{invoices}}', output: 'summary' } },
            { t: 'int_email', cfg: { to: 'accounts@example.com', subject: 'Daily overdue digest', body: '{{summary}}' } },
        ],
        trigger: { type: 'Schedule', cron: '0 9 * * *' },
    },
};

// ============================================================
// Module state — survives across the lifecycle of the Studio page
// ============================================================
let state = {
    page: null,
    wrapper: null,
    currentWorkflow: null,   // server name
    workflowName: 'Untitled workflow',
    enabled: false,
    trigger: { type: 'Manual' },
    runtime: { on_error: 'Stop', max_retries: 0, log_level: 'Info' },
    nodes: [],
    edges: [],
    selectedNodeId: null,
    connectingFrom: null,
    draggingType: null,
    nodeCounter: 0,
    currentTab: 'config',
    lastRun: null,
};

const uuid = () => 'n' + (++state.nodeCounter);

// ============================================================
// HTML scaffold
// ============================================================
window.flowagent_studio_html = function () {
    let sidebarHtml = '';
    SIDEBAR_GROUPS.forEach(g => {
        sidebarHtml += `<div class="fa-side-section">
            <div class="fa-side-label">${g.label}</div>`;
        g.types.forEach(t => {
            const def = NODE_DEFS[t];
            if (!def) return;
            const dot = CATEGORY_DOT[def.category] || '#888';
            sidebarHtml += `
                <div class="fa-node-chip" draggable="true" data-type="${t}">
                    <span class="fa-dot" style="background:${dot}"></span>${def.label}
                </div>`;
        });
        sidebarHtml += `</div>`;
    });

    return `
    <div id="fa-app">
      <div class="fa-topbar">
        <i class="ti ti-topology-star-3" style="font-size:16px;color:#534AB7"></i>
        <span class="fa-topbar-title">FlowAgent Studio</span>
        <span class="fa-topbar-badge">for Frappe</span>
        <div class="fa-tb-sep"></div>
        <button class="fa-tb-btn" data-action="open">
            <i class="ti ti-folder-open"></i> Open</button>
        <button class="fa-tb-btn" data-action="new">
            <i class="ti ti-plus"></i> New</button>
        <button class="fa-tb-btn" data-action="templates">
            <i class="ti ti-template"></i> Templates</button>
        <button class="fa-tb-btn" data-action="clear">
            <i class="ti ti-trash"></i> Clear</button>
        <div class="fa-tb-sep"></div>
        <label class="fa-tb-toggle">
            <input type="checkbox" id="fa-enabled-toggle">
            <span>Enabled</span>
        </label>
        <div class="fa-spacer"></div>
        <span id="fa-wf-name" title="Click to rename">Untitled workflow</span>
        <button class="fa-tb-btn" data-action="save">
            <i class="ti ti-device-floppy"></i> Save</button>
        <button class="fa-tb-btn fa-run" data-action="run">
            <i class="ti ti-player-play"></i> Run</button>
      </div>

      <div class="fa-main">
        <div class="fa-sidebar">${sidebarHtml}</div>

        <div class="fa-canvas-wrap" id="fa-canvas-wrap">
            <div class="fa-canvas-grid"></div>
            <svg class="fa-edges" id="fa-edges"></svg>
            <div id="fa-canvas"></div>
            <div class="fa-empty" id="fa-empty">
                <div style="font-size:32px;color:#cfc9f0"><i class="ti ti-topology-star-3"></i></div>
                <p>Drag nodes from the left</p>
                <p style="margin-top:4px;font-size:11px;color:var(--text-muted)">
                    or use <strong>AI Build</strong> →</p>
            </div>
        </div>

        <div class="fa-panel" id="fa-panel">
            <div class="fa-tabs">
                <div class="fa-tab fa-tab-active" data-tab="config">Config</div>
                <div class="fa-tab" data-tab="ai">AI Build</div>
                <div class="fa-tab" data-tab="runs">Runs</div>
                <div class="fa-tab" data-tab="stats">Stats</div>
            </div>

            <div class="fa-panel-pane" id="fa-pane-config">
                <div class="fa-panel-header"><i class="ti ti-adjustments"></i> Node config</div>
                <div class="fa-panel-body" id="fa-config-body">
                    <p class="fa-muted">Select a node to configure it</p>
                </div>
            </div>

            <div class="fa-panel-pane" id="fa-pane-ai" style="display:none">
                <div class="fa-panel-header"><i class="ti ti-sparkles" style="color:#534AB7"></i> AI workflow builder</div>
                <div class="fa-ai-messages" id="fa-ai-messages"></div>
                <div class="fa-ai-help">
                    Describe a workflow:
                    <a href="#" data-aip="When a Sales Invoice is submitted, extract key data with AI, check if amount > 50000, then send a WhatsApp approval request">→ Invoice approval flow</a>
                    <a href="#" data-aip="Monitor new Lead, classify it with AI, update lead score and notify the sales team on Slack">→ Lead auto-qualify</a>
                    <a href="#" data-aip="Every day at 9am fetch all overdue invoices, summarize with AI, email the digest to the accounts team">→ Daily digest</a>
                </div>
                <div class="fa-ai-input">
                    <input type="text" id="fa-ai-input" placeholder="Describe your workflow…">
                    <button class="fa-tb-btn fa-primary" data-action="ai-send">↗</button>
                </div>
            </div>

            <div class="fa-panel-pane" id="fa-pane-runs" style="display:none">
                <div class="fa-panel-header"><i class="ti ti-list"></i> Recent runs</div>
                <div class="fa-panel-body" id="fa-runs-body">
                    <p class="fa-muted">Save the workflow first to see runs</p>
                </div>
            </div>

            <div class="fa-panel-pane" id="fa-pane-stats" style="display:none">
                <div class="fa-panel-header"><i class="ti ti-chart-bar"></i> Stats</div>
                <div class="fa-stats-grid">
                    <div class="fa-stat"><div class="fa-sv" id="fa-stat-runs">0</div><div class="fa-sl">total runs</div></div>
                    <div class="fa-stat"><div class="fa-sv" id="fa-stat-ok" style="color:#1D9E75">0</div><div class="fa-sl">success</div></div>
                    <div class="fa-stat"><div class="fa-sv" id="fa-stat-err" style="color:#E24B4A">0</div><div class="fa-sl">errors</div></div>
                    <div class="fa-stat"><div class="fa-sv" id="fa-stat-ms">—</div><div class="fa-sl">avg ms</div></div>
                </div>
            </div>

            <div class="fa-runlog">
                <div class="fa-runlog-label">Run log</div>
                <div id="fa-runlog-body"></div>
            </div>
        </div>
      </div>
    </div>`;
};

// ============================================================
// Init
// ============================================================
window.flowagent_studio_init = function (page, wrapper) {
    state.page = page;
    state.wrapper = wrapper;
    bindEvents();
    refreshStats();
    addLog('Studio ready', 'info');

    // Check for handoff from "Open in Studio" button on a workflow form
    try {
        const pending = sessionStorage.getItem('flowagent.openWorkflow');
        if (pending) {
            sessionStorage.removeItem('flowagent.openWorkflow');
            loadWorkflow(pending);
        }
    } catch (_) {}
};

function bindEvents() {
    const root = document.getElementById('fa-app');
    if (!root) return;

    // Toolbar buttons
    root.querySelectorAll('[data-action]').forEach(btn => {
        btn.addEventListener('click', e => {
            e.preventDefault();
            handleAction(btn.dataset.action);
        });
    });

    // Tab switching
    root.querySelectorAll('.fa-tab').forEach(t => {
        t.addEventListener('click', () => switchTab(t.dataset.tab));
    });

    // Sidebar chips → drag start
    root.querySelectorAll('.fa-node-chip').forEach(chip => {
        chip.addEventListener('dragstart', e => {
            state.draggingType = chip.dataset.type;
            e.dataTransfer.effectAllowed = 'copy';
        });
    });

    // Canvas drop zone
    const wrap = document.getElementById('fa-canvas-wrap');
    wrap.addEventListener('dragover', e => e.preventDefault());
    wrap.addEventListener('drop', handleDrop);
    wrap.addEventListener('click', e => {
        if (e.target === wrap || e.target.classList.contains('fa-canvas-grid')) {
            deselectAll();
            state.connectingFrom = null;
        }
    });

    // Workflow name rename
    document.getElementById('fa-wf-name').addEventListener('click', () => {
        const n = prompt('Workflow name:', state.workflowName);
        if (n) {
            state.workflowName = n;
            document.getElementById('fa-wf-name').textContent = n;
        }
    });

    // Enabled toggle
    document.getElementById('fa-enabled-toggle').addEventListener('change', e => {
        state.enabled = e.target.checked;
    });

    // AI sample prompts
    root.querySelectorAll('[data-aip]').forEach(a => {
        a.addEventListener('click', e => {
            e.preventDefault();
            document.getElementById('fa-ai-input').value = a.dataset.aip;
            handleAction('ai-send');
        });
    });

    // Enter key on AI input
    document.getElementById('fa-ai-input').addEventListener('keydown', e => {
        if (e.key === 'Enter') handleAction('ai-send');
    });
}

function handleAction(name) {
    switch (name) {
        case 'open':       return openDialog();
        case 'new':        return newWorkflow();
        case 'templates':  return templatesDialog();
        case 'clear':      return clearCanvas(true);
        case 'save':       return saveWorkflow();
        case 'run':        return runWorkflow();
        case 'ai-send':    return aiSend();
    }
}

// ============================================================
// Workflow open / new / save / load
// ============================================================
function openDialog() {
    frappe.call({
        method: 'flowagent.api.studio.list_workflows',
        callback: r => {
            const list = r.message || [];
            const d = new frappe.ui.Dialog({
                title: 'Open Workflow',
                fields: [{
                    fieldname: 'pick', fieldtype: 'Select', label: 'Workflow',
                    options: list.map(w => w.name).join('\n'),
                    reqd: 1,
                }],
                primary_action_label: 'Open',
                primary_action: vals => {
                    d.hide();
                    loadWorkflow(vals.pick);
                },
            });
            d.show();
        },
    });
}

function newWorkflow() {
    const n = prompt('Name for the new workflow:', 'New Workflow');
    if (!n) return;
    state.currentWorkflow = null;
    state.workflowName = n;
    state.enabled = false;
    state.trigger = { type: 'Manual' };
    state.runtime = { on_error: 'Stop', max_retries: 0, log_level: 'Info' };
    state.nodes = [];
    state.edges = [];
    state.nodeCounter = 0;
    document.getElementById('fa-wf-name').textContent = n;
    document.getElementById('fa-enabled-toggle').checked = false;
    renderAll();
    renderConfigPanel();
    document.getElementById('fa-empty').style.display = '';
    addLog('New workflow', 'info');
}

function loadWorkflow(name) {
    frappe.call({
        method: 'flowagent.api.studio.load_workflow',
        args: { name },
        callback: r => {
            const w = r.message;
            if (!w) return;
            state.currentWorkflow = w.name;
            state.workflowName = w.workflow_name || w.name;
            state.enabled = !!w.enabled;
            state.trigger = w.trigger || { type: 'Manual' };
            state.runtime = w.runtime || { on_error: 'Stop' };
            state.nodes = (w.nodes || []).map(n => {
                const def = NODE_DEFS[n.type];
                return { ...n, def };
            });
            state.edges = w.edges || [];
            state.nodeCounter = Math.max(0, ...state.nodes
                .map(n => parseInt((n.id || 'n0').replace(/\D/g, ''), 10) || 0));
            document.getElementById('fa-wf-name').textContent = state.workflowName;
            document.getElementById('fa-enabled-toggle').checked = state.enabled;
            document.getElementById('fa-empty').style.display = state.nodes.length ? 'none' : '';
            renderAll();
            renderConfigPanel();
            refreshRuns();
            refreshStats();
            addLog(`Loaded "${state.workflowName}"`, 'info');
        },
    });
}

function saveWorkflow() {
    if (!state.workflowName || state.workflowName === 'Untitled workflow') {
        const n = prompt('Name this workflow:', '');
        if (!n) return;
        state.workflowName = n;
        document.getElementById('fa-wf-name').textContent = n;
    }
    // Infer trigger from the trigger node, if present
    const triggerNode = state.nodes.find(n => n.type && n.type.startsWith('trigger_'));
    if (triggerNode) {
        if (triggerNode.type === 'trigger_doctype') {
            state.trigger = {
                type: 'DocType Event',
                doctype: triggerNode.cfg.doctype,
                event: triggerNode.cfg.event,
            };
        } else if (triggerNode.type === 'trigger_schedule') {
            state.trigger = { type: 'Schedule', cron: triggerNode.cfg.cron };
        } else if (triggerNode.type === 'trigger_webhook') {
            state.trigger = { type: 'Webhook' };
        } else {
            state.trigger = { type: 'Manual' };
        }
    }

    const payload = {
        name: state.currentWorkflow,
        workflow_name: state.workflowName,
        enabled: state.enabled,
        trigger: state.trigger,
        runtime: state.runtime,
        nodes: state.nodes.map(n => ({
            id: n.id, type: n.type, x: n.x, y: n.y, cfg: n.cfg,
        })),
        edges: state.edges.map(e => ({ from: e.from, to: e.to, fromPort: e.fromPort })),
    };
    frappe.call({
        method: 'flowagent.api.studio.save_workflow',
        args: { payload: JSON.stringify(payload) },
        callback: r => {
            if (r.message) {
                state.currentWorkflow = r.message.name;
                addLog(`Saved "${state.workflowName}"`, 'ok');
                frappe.show_alert({ message: 'Workflow saved', indicator: 'green' });
            }
        },
        error: err => addLog('Save failed: ' + (err.message || err), 'err'),
    });
}

function clearCanvas(askConfirm) {
    if (askConfirm && state.nodes.length && !confirm('Clear the canvas?')) return;
    state.nodes = [];
    state.edges = [];
    state.selectedNodeId = null;
    state.connectingFrom = null;
    renderAll();
    renderConfigPanel();
    document.getElementById('fa-empty').style.display = '';
}

// ============================================================
// Canvas: drag, drop, render, wire
// ============================================================
function handleDrop(e) {
    if (!state.draggingType) return;
    const wrap = document.getElementById('fa-canvas-wrap');
    const rect = wrap.getBoundingClientRect();
    addNode(state.draggingType,
            e.clientX - rect.left - 85,
            e.clientY - rect.top - 40);
    state.draggingType = null;
    document.getElementById('fa-empty').style.display = 'none';
}

function addNode(type, x, y, overrides = {}) {
    const def = NODE_DEFS[type];
    if (!def) return;
    const id = uuid();
    const cfg = {};
    def.fields.forEach(f => { cfg[f.k] = (overrides[f.k] !== undefined) ? overrides[f.k] : f.v; });
    const n = { id, type, x: Math.max(0, x), y: Math.max(0, y), cfg, def };
    state.nodes.push(n);
    renderNode(n);
    renderEdges();
    return id;
}

function renderAll() {
    document.getElementById('fa-canvas').innerHTML = '';
    state.nodes.forEach(renderNode);
    renderEdges();
}

function renderNode(n) {
    const def = n.def || (n.def = NODE_DEFS[n.type]);
    if (!def) return;
    const canvas = document.getElementById('fa-canvas');
    let el = document.getElementById('fa-node-' + n.id);
    if (!el) {
        el = document.createElement('div');
        el.id = 'fa-node-' + n.id;
        el.className = 'fa-wf-node';
        canvas.appendChild(el);
    }
    el.style.left = n.x + 'px';
    el.style.top = n.y + 'px';
    const preview = nodePreviewText(n);
    const isTrigger = (n.type || '').startsWith('trigger_');
    const branch = def.hasBranch;

    el.innerHTML = `
        <div class="fa-node-head" style="background:${def.color}">
            <div class="fa-node-icon" style="background:${def.iconColor}22">
                <i class="ti ${def.icon}" style="color:${def.iconColor}"></i>
            </div>
            <span class="fa-node-name">${frappe.utils.escape_html(def.label)}</span>
            <span class="fa-node-status" id="fa-ns-${n.id}"></span>
        </div>
        <div class="fa-node-body">${preview}</div>
        ${!isTrigger ? `<div class="fa-port fa-port-in" data-node="${n.id}" data-port="in"></div>` : ''}
        ${branch
            ? `<div class="fa-port fa-port-yes" data-node="${n.id}" data-port="out-yes"></div>
               <div class="fa-port fa-port-no"  data-node="${n.id}" data-port="out-no"></div>
               <span class="fa-port-label fa-port-label-yes">Y</span>
               <span class="fa-port-label fa-port-label-no">N</span>`
            : `<div class="fa-port fa-port-out" data-node="${n.id}" data-port="out"></div>`}
    `;

    el.addEventListener('mousedown', e => startNodeDrag(e, n.id));
    el.addEventListener('click', e => { e.stopPropagation(); selectNode(n.id); });

    el.querySelectorAll('.fa-port').forEach(p => {
        p.addEventListener('click', e => {
            e.stopPropagation();
            handlePortClick(p.dataset.node, p.dataset.port);
        });
    });
}

function nodePreviewText(n) {
    const f = (n.def && n.def.fields && n.def.fields[0]);
    if (!f) return '<span class="fa-muted">no config</span>';
    const v = (n.cfg[f.k] || '').toString().substring(0, 60);
    return `<span class="fa-field-key">${frappe.utils.escape_html(f.l)}:</span> ${frappe.utils.escape_html(v)}`;
}

function startNodeDrag(e, id) {
    if (e.target.classList.contains('fa-port')) return;
    const n = state.nodes.find(x => x.id === id);
    if (!n) return;
    e.preventDefault();
    const wrap = document.getElementById('fa-canvas-wrap').getBoundingClientRect();
    const ox = e.clientX - wrap.left - n.x;
    const oy = e.clientY - wrap.top - n.y;
    function move(e2) {
        n.x = Math.max(0, e2.clientX - wrap.left - ox);
        n.y = Math.max(0, e2.clientY - wrap.top - oy);
        const el = document.getElementById('fa-node-' + id);
        if (el) { el.style.left = n.x + 'px'; el.style.top = n.y + 'px'; }
        renderEdges();
    }
    function up() {
        document.removeEventListener('mousemove', move);
        document.removeEventListener('mouseup', up);
    }
    document.addEventListener('mousemove', move);
    document.addEventListener('mouseup', up);
}

function selectNode(id) {
    deselectAll();
    state.selectedNodeId = id;
    const el = document.getElementById('fa-node-' + id);
    if (el) el.classList.add('fa-selected');
    renderConfigPanel();
    switchTab('config');
}

function deselectAll() {
    state.selectedNodeId = null;
    document.querySelectorAll('.fa-wf-node').forEach(e => e.classList.remove('fa-selected'));
}

// ============================================================
// Wiring (edges)
// ============================================================
function handlePortClick(nodeId, port) {
    if (!state.connectingFrom) {
        if (port === 'in') return;     // can't start a wire from an input port
        state.connectingFrom = { node: nodeId, port };
        flashPort(nodeId, port);
        return;
    }
    // Completing a wire
    const from = state.connectingFrom;
    state.connectingFrom = null;
    if (from.node === nodeId) return;  // self-loop disallowed
    if (port !== 'in') {
        // user clicked another output — treat as restart
        state.connectingFrom = { node: nodeId, port };
        flashPort(nodeId, port);
        return;
    }
    // Replace any existing edge from same source+port (one out-yes per node, etc.)
    state.edges = state.edges.filter(e => !(e.from === from.node && (e.fromPort || 'out') === from.port));
    state.edges.push({ from: from.node, to: nodeId, fromPort: from.port });
    renderEdges();
}

function flashPort(nodeId, port) {
    const portEl = document.querySelector(`.fa-port[data-node='${nodeId}'][data-port='${port}']`);
    if (portEl) {
        portEl.classList.add('fa-port-flash');
        setTimeout(() => portEl.classList.remove('fa-port-flash'), 1200);
    }
}

function renderEdges() {
    const svg = document.getElementById('fa-edges');
    const wrap = document.getElementById('fa-canvas-wrap');
    if (!svg || !wrap) return;
    svg.setAttribute('width', wrap.clientWidth);
    svg.setAttribute('height', wrap.clientHeight);
    svg.innerHTML = '';
    state.edges.forEach(e => {
        const from = state.nodes.find(n => n.id === e.from);
        const to = state.nodes.find(n => n.id === e.to);
        if (!from || !to) return;
        const fp = portXY(from, e.fromPort || 'out');
        const tp = portXY(to, 'in');
        const dx = (tp.x - fp.x) / 2;
        const d = `M${fp.x},${fp.y} C${fp.x + dx},${fp.y} ${tp.x - dx},${tp.y} ${tp.x},${tp.y}`;
        const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        path.setAttribute('d', d);
        path.setAttribute('class', 'fa-edge-path');
        if (e.runHighlight) path.classList.add('fa-edge-active');
        svg.appendChild(path);
    });
}

function portXY(node, port) {
    // Node is 170px wide, head ~36px high. Approximate.
    const W = 170, H = 80;
    if (port === 'in')      return { x: node.x,       y: node.y + H / 2 };
    if (port === 'out')     return { x: node.x + W,   y: node.y + H / 2 };
    if (port === 'out-yes') return { x: node.x + W,   y: node.y + H * 0.35 };
    if (port === 'out-no')  return { x: node.x + W,   y: node.y + H * 0.65 };
    return { x: node.x + W, y: node.y + H / 2 };
}

// ============================================================
// Right-side config panel
// ============================================================
function renderConfigPanel() {
    const body = document.getElementById('fa-config-body');
    if (!state.selectedNodeId) {
        body.innerHTML = '<p class="fa-muted">Select a node to configure it</p>';
        return;
    }
    const n = state.nodes.find(x => x.id === state.selectedNodeId);
    if (!n) return;
    const def = n.def;
    let html = `
        <div class="fa-cfg-title">
            <i class="ti ${def.icon}" style="color:${def.iconColor}"></i>
            ${frappe.utils.escape_html(def.label)}
            <button class="fa-cfg-delete" data-action="delete-node" title="Delete node">
                <i class="ti ti-trash"></i>
            </button>
        </div>
        <div class="fa-muted" style="margin-bottom:8px;font-size:11px">ID: ${n.id}</div>
    `;
    def.fields.forEach(f => {
        html += renderField(n.id, f, n.cfg[f.k]);
    });
    body.innerHTML = html;

    body.querySelectorAll('[data-cfg-key]').forEach(inp => {
        inp.addEventListener('input', e => {
            const key = inp.dataset.cfgKey;
            n.cfg[key] = inp.value;
            renderNode(n);
        });
        if (inp.tagName === 'SELECT') {
            inp.addEventListener('change', e => {
                const key = inp.dataset.cfgKey;
                n.cfg[key] = inp.value;
                renderNode(n);
            });
        }
    });

    const delBtn = body.querySelector('[data-action="delete-node"]');
    if (delBtn) delBtn.addEventListener('click', () => deleteNode(n.id));
}

function renderField(nodeId, f, val) {
    const escaped = frappe.utils.escape_html(val == null ? '' : val);
    if (f.t === 'textarea') {
        return `<div class="fa-field">
            <label>${f.l}</label>
            <textarea data-cfg-key="${f.k}" rows="3">${escaped}</textarea>
        </div>`;
    }
    if (f.t === 'select') {
        const opts = (f.opts || []).map(o =>
            `<option value="${o}" ${o === val ? 'selected' : ''}>${o}</option>`).join('');
        return `<div class="fa-field">
            <label>${f.l}</label>
            <select data-cfg-key="${f.k}">${opts}</select>
        </div>`;
    }
    if (f.t === 'link') {
        return `<div class="fa-field">
            <label>${f.l}</label>
            <input type="text" data-cfg-key="${f.k}" value="${escaped}" placeholder="${f.options}"/>
        </div>`;
    }
    return `<div class="fa-field">
        <label>${f.l}</label>
        <input type="text" data-cfg-key="${f.k}" value="${escaped}"/>
    </div>`;
}

function deleteNode(id) {
    state.nodes = state.nodes.filter(n => n.id !== id);
    state.edges = state.edges.filter(e => e.from !== id && e.to !== id);
    state.selectedNodeId = null;
    const el = document.getElementById('fa-node-' + id);
    if (el) el.remove();
    renderEdges();
    renderConfigPanel();
}

// ============================================================
// Tabs
// ============================================================
function switchTab(name) {
    state.currentTab = name;
    document.querySelectorAll('.fa-tab').forEach(t =>
        t.classList.toggle('fa-tab-active', t.dataset.tab === name));
    ['config', 'ai', 'runs', 'stats'].forEach(t => {
        const pane = document.getElementById('fa-pane-' + t);
        if (pane) pane.style.display = (t === name) ? '' : 'none';
    });
    if (name === 'runs') refreshRuns();
    if (name === 'stats') refreshStats();
}

// ============================================================
// AI Build
// ============================================================
function aiSend() {
    const inp = document.getElementById('fa-ai-input');
    const msg = inp.value.trim();
    if (!msg) return;
    inp.value = '';
    const msgs = document.getElementById('fa-ai-messages');
    msgs.innerHTML += `<div class="fa-ai-msg fa-ai-msg-user">${frappe.utils.escape_html(msg)}</div>`;
    const typingId = 'fa-typing-' + Date.now();
    msgs.innerHTML += `<div class="fa-ai-msg fa-ai-msg-ai" id="${typingId}">Building…</div>`;
    msgs.scrollTop = msgs.scrollHeight;

    frappe.call({
        method: 'flowagent.api.ai_build.build_from_prompt',
        args: { prompt: msg },
        callback: r => {
            document.getElementById(typingId)?.remove();
            const parsed = r.message;
            if (!parsed || !parsed.nodes) {
                msgs.innerHTML += `<div class="fa-ai-msg fa-ai-msg-ai">No workflow could be parsed from that. Try describing trigger → AI step → action.</div>`;
                return;
            }
            applyAIWorkflow(parsed);
            msgs.innerHTML += `<div class="fa-ai-msg fa-ai-msg-ai">
                <span style="color:#1D9E75">✓ Built:</span> ${parsed.nodes.length} nodes laid out.</div>`;
            msgs.scrollTop = msgs.scrollHeight;
        },
        error: err => {
            document.getElementById(typingId)?.remove();
            msgs.innerHTML += `<div class="fa-ai-msg fa-ai-msg-ai" style="color:#E24B4A">
                Build failed: ${frappe.utils.escape_html((err && err.message) || 'unknown error')}</div>`;
        },
    });
}

function applyAIWorkflow(parsed) {
    clearCanvas(false);
    if (parsed.workflow_name) {
        state.workflowName = parsed.workflow_name;
        document.getElementById('fa-wf-name').textContent = parsed.workflow_name;
    }
    if (parsed.trigger) state.trigger = parsed.trigger;
    document.getElementById('fa-empty').style.display = 'none';

    // The AI might return numeric or string IDs — normalize to internal n1, n2, …
    const idMap = {};
    (parsed.nodes || []).forEach((nd, idx) => {
        const internalId = uuid();
        idMap[nd.id || idx] = internalId;
        const def = NODE_DEFS[nd.type];
        if (!def) return;
        const cfg = {};
        def.fields.forEach(f => { cfg[f.k] = f.v; });
        Object.assign(cfg, nd.cfg || {});
        const n = {
            id: internalId,
            type: nd.type,
            x: nd.x != null ? nd.x : (30 + idx * 200),
            y: nd.y != null ? nd.y : 150,
            cfg, def,
        };
        state.nodes.push(n);
        renderNode(n);
    });
    (parsed.edges || []).forEach(e => {
        const from = idMap[e.from];
        const to = idMap[e.to];
        if (from && to) state.edges.push({ from, to, fromPort: e.fromPort });
    });
    if ((!parsed.edges || !parsed.edges.length) && state.nodes.length > 1) {
        // Auto-link as a straight chain
        for (let i = 0; i < state.nodes.length - 1; i++) {
            state.edges.push({ from: state.nodes[i].id, to: state.nodes[i + 1].id });
        }
    }
    renderEdges();
}

// ============================================================
// Templates
// ============================================================
function templatesDialog() {
    const d = new frappe.ui.Dialog({
        title: 'Start from a template',
        fields: [{
            fieldname: 'pick', fieldtype: 'Select', label: 'Template',
            options: Object.keys(TEMPLATES).map(k => `${k}\n`).join('').trim()
                .split('\n').join('\n'),
            reqd: 1,
        }],
        primary_action_label: 'Load',
        primary_action: vals => {
            d.hide();
            loadTemplate(vals.pick);
        },
    });
    d.show();
}

function loadTemplate(key) {
    const tpl = TEMPLATES[key];
    if (!tpl) return;
    clearCanvas(false);
    state.workflowName = tpl.name;
    document.getElementById('fa-wf-name').textContent = tpl.name;
    state.trigger = tpl.trigger || { type: 'Manual' };
    tpl.nodes.forEach((nd, idx) => {
        addNode(nd.t, 30 + idx * 200, 150, nd.cfg);
    });
    // chain them
    for (let i = 0; i < state.nodes.length - 1; i++) {
        const from = state.nodes[i], to = state.nodes[i + 1];
        if (from.def && from.def.hasBranch) {
            state.edges.push({ from: from.id, to: to.id, fromPort: 'out-yes' });
        } else {
            state.edges.push({ from: from.id, to: to.id });
        }
    }
    renderEdges();
    document.getElementById('fa-empty').style.display = 'none';
    addLog(`Loaded template "${tpl.name}"`, 'info');
}

// ============================================================
// Run + trace
// ============================================================
function runWorkflow() {
    if (!state.currentWorkflow) {
        if (!confirm('Save before running?')) return;
        // chain save → run
        return saveThenRun();
    }
    addLog('Running…', 'info');
    document.querySelectorAll('.fa-node-status').forEach(s => s.style.background = 'var(--border-color)');
    frappe.call({
        method: 'flowagent.api.studio.run_workflow_now',
        args: { name: state.currentWorkflow, sync: 1 },
        callback: r => {
            const run = r.message;
            if (!run) return;
            state.lastRun = run;
            paintTrace(run);
            refreshStats();
            const colour = run.status === 'Success' ? 'ok' : 'err';
            addLog(`Run ${run.name}: ${run.status} (${run.duration_ms}ms)`, colour);
        },
        error: err => addLog('Run failed: ' + (err.message || err), 'err'),
    });
}

function saveThenRun() {
    if (!state.workflowName || state.workflowName === 'Untitled workflow') {
        const n = prompt('Name this workflow:', '');
        if (!n) return;
        state.workflowName = n;
        document.getElementById('fa-wf-name').textContent = n;
    }
    const triggerNode = state.nodes.find(n => n.type && n.type.startsWith('trigger_'));
    if (triggerNode) {
        if (triggerNode.type === 'trigger_doctype') {
            state.trigger = { type: 'DocType Event',
                              doctype: triggerNode.cfg.doctype,
                              event: triggerNode.cfg.event };
        } else if (triggerNode.type === 'trigger_schedule') {
            state.trigger = { type: 'Schedule', cron: triggerNode.cfg.cron };
        }
    }
    const payload = {
        workflow_name: state.workflowName,
        enabled: state.enabled,
        trigger: state.trigger,
        runtime: state.runtime,
        nodes: state.nodes.map(n => ({ id: n.id, type: n.type, x: n.x, y: n.y, cfg: n.cfg })),
        edges: state.edges.map(e => ({ from: e.from, to: e.to, fromPort: e.fromPort })),
    };
    frappe.call({
        method: 'flowagent.api.studio.save_workflow',
        args: { payload: JSON.stringify(payload) },
        callback: r => {
            state.currentWorkflow = r.message.name;
            runWorkflow();
        },
    });
}

function paintTrace(run) {
    // Reset all status dots
    document.querySelectorAll('.fa-node-status').forEach(s => s.style.background = 'var(--border-color)');
    state.edges.forEach(e => e.runHighlight = false);
    (run.steps || []).forEach(step => {
        const dot = document.getElementById('fa-ns-' + step.node_id);
        if (dot) {
            dot.style.background = step.status === 'Success' ? '#1D9E75'
                : step.status === 'Failed' ? '#E24B4A'
                : '#BA7517';
        }
        addLog(`#${step.step_index} ${step.node_label} → ${step.status}${step.error ? ' — ' + (step.error || '').split('\n')[0] : ''} (${step.duration_ms}ms)`,
               step.status === 'Success' ? 'ok' : step.status === 'Failed' ? 'err' : 'warn');
    });
    renderEdges();
}

// ============================================================
// Runs / Stats panels
// ============================================================
function refreshRuns() {
    if (!state.currentWorkflow) {
        document.getElementById('fa-runs-body').innerHTML =
            '<p class="fa-muted">Save the workflow first to see runs</p>';
        return;
    }
    frappe.call({
        method: 'flowagent.api.studio.recent_runs',
        args: { workflow: state.currentWorkflow, limit: 30 },
        callback: r => {
            const runs = r.message || [];
            const body = document.getElementById('fa-runs-body');
            if (!runs.length) {
                body.innerHTML = '<p class="fa-muted">No runs yet</p>';
                return;
            }
            body.innerHTML = runs.map(run => `
                <div class="fa-run-row" data-run="${run.name}">
                    <span class="fa-run-status fa-run-${(run.status || '').toLowerCase()}"></span>
                    <span class="fa-run-name">${run.name}</span>
                    <span class="fa-run-src">${frappe.utils.escape_html(run.trigger_source || '')}</span>
                    <span class="fa-run-ms">${run.duration_ms || 0}ms</span>
                </div>
            `).join('');
            body.querySelectorAll('.fa-run-row').forEach(r => {
                r.addEventListener('click', () => openRun(r.dataset.run));
            });
        },
    });
}

function openRun(name) {
    frappe.call({
        method: 'flowagent.api.studio.get_run',
        args: { run_name: name },
        callback: r => {
            const run = r.message;
            if (!run) return;
            state.lastRun = run;
            paintTrace(run);
        },
    });
}

function refreshStats() {
    frappe.call({
        method: 'flowagent.api.studio.workflow_stats',
        args: state.currentWorkflow ? { workflow: state.currentWorkflow } : {},
        callback: r => {
            const s = r.message || {};
            document.getElementById('fa-stat-runs').textContent = s.runs || 0;
            document.getElementById('fa-stat-ok').textContent = s.ok || 0;
            document.getElementById('fa-stat-err').textContent = s.err || 0;
            document.getElementById('fa-stat-ms').textContent = s.avg_ms ? (s.avg_ms + 'ms') : '—';
        },
    });
}

// ============================================================
// Run log
// ============================================================
function addLog(msg, kind) {
    const body = document.getElementById('fa-runlog-body');
    if (!body) return;
    const time = new Date().toLocaleTimeString();
    const klass = 'fa-log-' + (kind || 'info');
    const line = document.createElement('div');
    line.className = 'fa-log-line';
    line.innerHTML = `<span class="fa-log-time">${time}</span>
                      <span class="${klass}">${frappe.utils.escape_html(msg)}</span>`;
    body.appendChild(line);
    body.scrollTop = body.scrollHeight;
    while (body.children.length > 100) body.removeChild(body.firstChild);
}

})();
