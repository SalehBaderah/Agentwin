"""Branded, server-side email delivery for stored Agentwin alerts and summaries."""

import html
import os
import re
import smtplib
import ssl
import time
from email.message import EmailMessage
from pathlib import Path

LOGO = Path(__file__).resolve().parent / 'assets' / 'agentwin-logo.png'


def last_telemetry_label(received, as_of):
    """Describe the latest live reading relative to a fixed summary window."""
    if received is None:
        return 'No stored live telemetry in this session'
    age = max(0, int(as_of - received))
    if age < 60:
        relative = 'less than a minute ago'
    elif age < 3600:
        minutes = age // 60
        relative = f'{minutes} minute{"s" if minutes != 1 else ""} ago'
    elif age < 86400:
        hours = age // 3600
        relative = f'{hours} hour{"s" if hours != 1 else ""} ago'
    else:
        days = age // 86400
        relative = f'{days} day{"s" if days != 1 else ""} ago'
    stamp = time.strftime('%Y-%m-%d %H:%M:%S UTC', time.gmtime(received))
    return f'{relative} ({stamp})'


def _email_content(item):
    """Separate stored email metadata from its finding, including queued legacy mail."""
    body = item['body']
    header, separator, finding = body.partition('\n\n')
    lines = header.splitlines()
    window_label = 'Live window: ' if item['ref_kind'] == 'summary' else 'Detected: '
    last_label = 'Last telemetry (at window end): '
    has_last = len(lines) == 3 and lines[2].startswith(last_label)
    if separator and len(lines) in (2, 3) and (len(lines) == 2 or has_last) and lines[0].startswith('Project: ') and lines[1].startswith(window_label):
        project = lines[0][len('Project: '):]
        window = lines[1][len(window_label):]
        last_telemetry = lines[2][len(last_label):] if has_last else None
    else:
        project, window, last_telemetry, finding = None, None, None, body
    paragraphs = [
        sentence.strip()
        for block in finding.splitlines()
        for sentence in re.split(r'(?<=[.!?])\s+(?=[A-Z0-9])', block)
        if sentence.strip()
    ]
    return project, window, last_telemetry, paragraphs


def smtp_configured():
    return bool(os.getenv('AGENTWIN_SMTP_HOST') and os.getenv('AGENTWIN_EMAIL_FROM'))


def send_email(item):
    if not smtp_configured():
        raise ValueError('SMTP host and sender are required')
    host = os.environ['AGENTWIN_SMTP_HOST']
    port = int(os.getenv('AGENTWIN_SMTP_PORT', '587'))
    security = os.getenv('AGENTWIN_SMTP_SECURITY', 'starttls').lower()
    if security not in ('starttls', 'ssl', 'none'):
        raise ValueError('SMTP security must be starttls, ssl, or none')
    sender = os.environ['AGENTWIN_EMAIL_FROM']
    recipient = item['recipient']
    if any(char in sender + recipient for char in '\r\n'):
        raise ValueError('Invalid email header')
    message = EmailMessage()
    message['From'] = sender
    message['To'] = recipient
    message['Subject'] = ' '.join(item['subject'].split())[:180]
    label = 'Operational alert' if item['ref_kind'] == 'event' else 'Scheduled project summary'
    message.set_content(f"Agentwin | {label}\n\n{item['body']}\n\nGenerated from stored live-session evidence. Missing data does not establish a physical cause.\n")
    project, window, last_telemetry, paragraphs = _email_content(item)
    metadata = ''
    if project is not None:
        time_label = 'Reporting window' if item['ref_kind'] == 'summary' else 'Detected'
        last_telemetry_html = f'''<tr><td style="padding:0 0 5px;color:#66707b;font-size:13px">Last telemetry (at window end)</td></tr>
<tr><td style="padding:0 0 20px;color:#1d232b;font-size:15px;font-weight:bold;line-height:1.5;word-break:break-word">{html.escape(last_telemetry)}</td></tr>''' if last_telemetry is not None else ''
        metadata = f'''<table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="border-collapse:collapse;margin:0 0 24px">
<tr><td style="padding:0 0 5px;color:#66707b;font-size:13px">Project</td></tr>
<tr><td style="padding:0 0 18px;color:#1d232b;font-size:18px;font-weight:bold;line-height:1.35;word-break:break-word">{html.escape(project)}</td></tr>
<tr><td style="padding:0 0 5px;color:#66707b;font-size:13px">{time_label}</td></tr>
<tr><td style="padding:0 0 20px;color:#344052;font-size:14px;line-height:1.5;word-break:break-word">{html.escape(window)}</td></tr>
{last_telemetry_html}
</table>'''
    finding_html = ''.join(
        f'<p style="margin:0 0 12px;color:#1d232b;font-size:15px;line-height:1.6;word-break:break-word">{html.escape(paragraph)}</p>'
        for paragraph in paragraphs
    )
    content = f'''<!doctype html><html><body style="margin:0;padding:0;background:#f4f5f7;color:#1d232b;font-family:Arial,Helvetica,sans-serif">
<table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="border-collapse:collapse;background:#f4f5f7"><tr><td align="center" style="padding:24px 12px">
<table role="presentation" cellpadding="0" cellspacing="0" width="600" style="width:100%;max-width:600px;border-collapse:collapse;background:#ffffff;border:1px solid #dfe1e5">
<tr><td style="padding:28px 30px 22px;border-top:4px solid #7153ca;border-bottom:1px solid #e6e8ec">
<img src="cid:agentwin-logo" alt="" width="42" height="36" style="display:inline-block;vertical-align:middle;margin-right:10px"><strong style="display:inline-block;vertical-align:middle;color:#1d232b;font-size:22px">Agentwin</strong></td></tr>
<tr><td style="padding:28px 30px 18px">
<h1 style="margin:0 0 24px;color:#1d232b;font-size:23px;line-height:1.3;font-weight:bold">{html.escape(label)}</h1>
{metadata}
<div style="border-top:1px solid #e6e8ec;padding-top:20px">{finding_html}</div>
</td></tr>
<tr><td style="padding:18px 30px 24px;border-top:1px solid #e6e8ec;color:#66707b;font-size:12px;line-height:1.5">Generated from stored live-session evidence. Missing data does not establish a physical cause.</td></tr>
</table></td></tr></table></body></html>'''
    message.add_alternative(content, subtype='html')
    if LOGO.exists():
        message.get_payload()[-1].add_related(LOGO.read_bytes(), maintype='image', subtype='png', cid='<agentwin-logo>', disposition='inline')
    context = ssl.create_default_context()
    if security == 'ssl':
        connection = smtplib.SMTP_SSL(host, port, timeout=10, context=context)
    else:
        connection = smtplib.SMTP(host, port, timeout=10)
    with connection as smtp:
        if security == 'starttls': smtp.starttls(context=context)
        user = os.getenv('AGENTWIN_SMTP_USER')
        if user: smtp.login(user, os.getenv('AGENTWIN_SMTP_PASSWORD', ''))
        smtp.send_message(message)
