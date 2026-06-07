"""
Sleep Checker Lambda — runs every 5 minutes via EventBridge.

Logic:
  1. Read last_activity timestamp from DynamoDB
  2. If > INACTIVITY_MINUTES since last request → scale ECS services to 0
  3. Publish SNS alert with wake URL so operator can restart
"""
import json
import os
import boto3
from datetime import datetime, timezone, timedelta

ecs      = boto3.client("ecs")
dynamo   = boto3.resource("dynamodb")
sns      = boto3.client("sns")

ACTIVITY_TABLE     = os.environ["ACTIVITY_TABLE"]
CLUSTER_NAME       = os.environ["CLUSTER_NAME"]
API_SERVICE        = os.environ["API_SERVICE"]
WORKER_SERVICE     = os.environ["WORKER_SERVICE"]
ALERT_TOPIC_ARN    = os.environ["ALERT_TOPIC_ARN"]
INACTIVITY_MINUTES = int(os.environ.get("INACTIVITY_MINUTES", "15"))


def get_last_activity() -> datetime | None:
    table = dynamo.Table(ACTIVITY_TABLE)
    resp  = table.get_item(Key={"pk": "last_activity"})
    item  = resp.get("Item")
    if not item:
        return None
    ts_str = item.get("timestamp")
    if not ts_str:
        return None
    return datetime.fromisoformat(ts_str)


def get_running_count(service_name: str) -> int:
    resp = ecs.describe_services(cluster=CLUSTER_NAME, services=[service_name])
    services = resp.get("services", [])
    if not services:
        return 0
    return services[0].get("runningCount", 0)


def scale_service(service_name: str, desired: int):
    ecs.update_service(
        cluster=CLUSTER_NAME,
        service=service_name,
        desiredCount=desired,
    )
    print(f"Scaled {service_name} → {desired} tasks")


def lambda_handler(event, context):
    now          = datetime.now(timezone.utc)
    last_activity = get_last_activity()

    if last_activity is None:
        print("No activity record found — skipping sleep check")
        return {"action": "no_activity_record"}

    idle_minutes = (now - last_activity).total_seconds() / 60
    print(f"Last activity: {last_activity.isoformat()} ({idle_minutes:.1f} min ago)")

    if idle_minutes < INACTIVITY_MINUTES:
        print(f"Active within last {INACTIVITY_MINUTES} min — no action")
        return {"action": "active", "idle_minutes": idle_minutes}

    # Check if already sleeping (avoid duplicate alerts)
    api_count = get_running_count(API_SERVICE)
    if api_count == 0:
        print("Services already at 0 tasks — skipping")
        return {"action": "already_sleeping"}

    # Scale both services to 0
    scale_service(API_SERVICE,    0)
    scale_service(WORKER_SERVICE, 0)

    # Build wake URL from API Gateway (resolved from env set by CDK)
    wake_url = os.environ.get("WAKE_API_URL", "Check AWS Console to wake services")

    # Alert
    idle_str = f"{idle_minutes:.0f}"
    sns.publish(
        TopicArn=ALERT_TOPIC_ARN,
        Subject="💤 LeadGenie-AI — auto-sleep triggered",
        Message=f"""LeadGenie-AI has been idle for {idle_str} minutes and has been put to sleep.

Last activity : {last_activity.strftime('%Y-%m-%d %H:%M:%S UTC')}
Idle duration : {idle_str} minutes
Threshold     : {INACTIVITY_MINUTES} minutes

Services scaled to 0:
  • {API_SERVICE}
  • {WORKER_SERVICE}

━━━ To wake the system ━━━
Open this URL in your browser:
{wake_url}

Or run:
  aws ecs update-service --cluster {CLUSTER_NAME} --service {API_SERVICE} --desired-count 2
  aws ecs update-service --cluster {CLUSTER_NAME} --service {WORKER_SERVICE} --desired-count 1

Services take ~30–60 seconds to become healthy after waking.
""",
    )

    return {
        "action":       "slept",
        "idle_minutes": idle_minutes,
        "services":     [API_SERVICE, WORKER_SERVICE],
    }
