"""
Wake Lambda — triggered via API Gateway GET request.

Scales ECS services back to their normal desired counts and returns
an HTML page that auto-refreshes until the service is healthy.
"""
import json
import os
import boto3
import time

ecs = boto3.client("ecs")
sns = boto3.client("sns")

CLUSTER_NAME    = os.environ["CLUSTER_NAME"]
API_SERVICE     = os.environ["API_SERVICE"]
WORKER_SERVICE  = os.environ["WORKER_SERVICE"]
ALERT_TOPIC_ARN = os.environ["ALERT_TOPIC_ARN"]

API_DESIRED    = int(os.environ.get("API_DESIRED_COUNT",    "2"))
WORKER_DESIRED = int(os.environ.get("WORKER_DESIRED_COUNT", "1"))


WAKING_HTML = """<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta http-equiv="refresh" content="20">
  <title>LeadGenie-AI — Waking Up</title>
  <style>
    body {{ font-family: -apple-system, sans-serif; background: #0f1117; color: #e2e8f0;
           display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; }}
    .card {{ text-align: center; padding: 2rem; max-width: 400px; }}
    .pulse {{ width: 60px; height: 60px; background: #6366f1; border-radius: 50%;
              margin: 0 auto 1.5rem; animation: pulse 1.5s ease-in-out infinite; }}
    @keyframes pulse {{ 0%,100% {{ transform: scale(1); opacity: 1; }}
                        50% {{ transform: scale(1.15); opacity: 0.7; }} }}
    h1 {{ font-size: 1.4rem; margin-bottom: 0.5rem; }}
    p  {{ color: #94a3b8; font-size: 0.9rem; }}
    .eta {{ margin-top: 1rem; color: #6366f1; font-size: 0.8rem; font-family: monospace; }}
  </style>
</head>
<body>
  <div class="card">
    <div class="pulse"></div>
    <h1>Waking Up…</h1>
    <p>LeadGenie-AI was sleeping after 15 minutes of inactivity.</p>
    <p>Services are starting. This page refreshes automatically.</p>
    <div class="eta">ETA: ~30–60 seconds · status: {status}</div>
  </div>
</body>
</html>"""

AWAKE_HTML = """<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta http-equiv="refresh" content="2;url={app_url}">
  <title>LeadGenie-AI — Ready</title>
  <style>
    body {{ font-family: -apple-system, sans-serif; background: #0f1117; color: #e2e8f0;
           display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; }}
    .card {{ text-align: center; padding: 2rem; }}
    h1 {{ color: #22c55e; }}
    p  {{ color: #94a3b8; font-size: 0.9rem; }}
  </style>
</head>
<body>
  <div class="card">
    <h1>✓ System Ready</h1>
    <p>Redirecting to LeadGenie-AI…</p>
  </div>
</body>
</html>"""


def get_service_status(service_name: str) -> dict:
    resp     = ecs.describe_services(cluster=CLUSTER_NAME, services=[service_name])
    services = resp.get("services", [])
    if not services:
        return {"running": 0, "desired": 0}
    svc = services[0]
    return {"running": svc["runningCount"], "desired": svc["desiredCount"]}


def lambda_handler(event, context):
    app_url = os.environ.get("APP_URL", "/")

    # Scale up if needed
    api_status = get_service_status(API_SERVICE)
    if api_status["desired"] == 0:
        ecs.update_service(cluster=CLUSTER_NAME, service=API_SERVICE,    desiredCount=API_DESIRED)
        ecs.update_service(cluster=CLUSTER_NAME, service=WORKER_SERVICE, desiredCount=WORKER_DESIRED)
        print(f"Woke services: {API_SERVICE}→{API_DESIRED}, {WORKER_SERVICE}→{WORKER_DESIRED}")

        sns.publish(
            TopicArn=ALERT_TOPIC_ARN,
            Subject="☀️ LeadGenie-AI — waking up",
            Message=f"Wake triggered. Services scaling to {API_DESIRED} API + {WORKER_DESIRED} worker tasks.",
        )

    # Check current state
    api_status = get_service_status(API_SERVICE)
    is_ready   = api_status["running"] >= 1

    if is_ready:
        body        = AWAKE_HTML.format(app_url=app_url)
        status_code = 200
    else:
        status_str  = f"running {api_status['running']}/{api_status['desired']} tasks"
        body        = WAKING_HTML.format(status=status_str)
        status_code = 202

    return {
        "statusCode": status_code,
        "headers": {
            "Content-Type": "text/html; charset=utf-8",
            "Cache-Control": "no-cache, no-store, must-revalidate",
        },
        "body": body,
    }
