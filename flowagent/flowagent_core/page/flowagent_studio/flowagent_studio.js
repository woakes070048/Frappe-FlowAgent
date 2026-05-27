// Copyright (c) 2026, FlowAgent and contributors
// For license information, please see license.txt
//
// FlowAgent Studio — visual workflow builder for Frappe.
// Hosted at /app/flowagent-studio.

frappe.pages['flowagent-studio'].on_page_load = function(wrapper) {
    const page = frappe.ui.make_app_page({
        parent: wrapper,
        title: 'FlowAgent Studio',
        single_column: true,
    });

    // We mount our own UI directly inside the page body — Frappe gives us a
    // canvas, we paint on it.
    const $body = $(wrapper).find('.layout-main-section');
    $body.empty();
    $body.html(window.flowagent_studio_html());
    window.flowagent_studio_init(page, wrapper);
};
