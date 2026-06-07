from diagrams import Diagram, Cluster, Edge
from diagrams.aws.compute import Lambda, ECS, ElasticContainerService
from diagrams.aws.database import RDS, Dynamodb, ElastiCache
from diagrams.aws.network import CloudFront, ALB, APIGateway
from diagrams.aws.storage import S3
from diagrams.aws.integration import SNS, SQS, Eventbridge
from diagrams.aws.security import SecretsManager
from diagrams.aws.management import Cloudwatch, SystemsManagerParameterStore
from diagrams.aws.engagement import SES
from diagrams.aws.devtools import XRay
from diagrams.onprem.client import Users

graph_attr = {
    "fontsize": "20",
    "bgcolor": "#0f1117",
    "fontcolor": "#e2e8f0",
    "pad": "0.9",
    "ranksep": "1.1",
    "nodesep": "0.65",
    "splines": "ortho",
}

node_attr = {
    "fontsize": "11",
    "fontcolor": "#e2e8f0",
}

with Diagram(
    "LeadGenie-AI  ·  V2 Production (ECS Fargate)",
    filename="/tmp/leadgenie_v2_prod",
    outformat="png",
    show=False,
    direction="LR",
    graph_attr=graph_attr,
    node_attr=node_attr,
):
    user = Users("Browser")

    with Cluster("CDN / Edge", graph_attr={"bgcolor": "#1a1f2e", "fontcolor": "#94a3b8", "style": "rounded"}):
        cf  = CloudFront("CloudFront")
        spa = S3("S3  React SPA")
        cf >> spa

    with Cluster("Ingress", graph_attr={"bgcolor": "#1a1f2e", "fontcolor": "#94a3b8", "style": "rounded"}):
        alb   = ALB("ALB")
        apigw = APIGateway("API Gateway\nWebSocket\n(live agent feed)")

    with Cluster("ECS Fargate — API Service  (2 tasks, auto-scale)", graph_attr={"bgcolor": "#1e2535", "fontcolor": "#93c5fd", "style": "rounded"}):
        ecs_api = ECS("Fargate\nFastAPI\n0.5 vCPU · 1 GB")

    with Cluster("ECS Fargate — Worker Service  (1–8 tasks, Spot)", graph_attr={"bgcolor": "#1a2820", "fontcolor": "#86efac", "style": "rounded"}):
        sqs        = SQS("SQS\nAgent Job Queue")
        ecs_worker = ECS("Fargate Workers\nresearch · outreach\ngovernance · intent\n1 vCPU · 2 GB")
        sqs >> ecs_worker

    with Cluster("Memory Stores", graph_attr={"bgcolor": "#1a1f2e", "fontcolor": "#94a3b8", "style": "rounded"}):
        rds   = RDS("RDS Postgres\nt3.medium Multi-AZ\n+ pgvector\n(episodic · semantic\nlead profile · outreach\nFinOps reporting)")
        redis = ElastiCache("ElastiCache Redis\nt3.small cluster\n(working memory\nsemantic cache\nvector search)")
        s3tpl = S3("S3\nTemplates\n& KB docs\n(procedural mem)")

    with Cluster("Budget & Alerts", graph_attr={"bgcolor": "#1e1515", "fontcolor": "#fca5a5", "style": "rounded"}):
        dynamo    = Dynamodb("DynamoDB\n(token budget\natomic counters\nday / month TTL)")
        sns       = SNS("SNS\nAlert Topic")
        ses       = SES("SES\nEmail Alerts")
        fn_alert  = Lambda("Lambda\nSlack / Webhook")
        sns >> ses
        sns >> fn_alert

    with Cluster("Scheduling", graph_attr={"bgcolor": "#1a1f2e", "fontcolor": "#94a3b8", "style": "rounded"}):
        eb       = Eventbridge("EventBridge\ndaily 00:00 UTC")
        fn_reset = Lambda("Lambda\nBudget Reset\n+ daily summary")
        eb >> fn_reset >> dynamo

    with Cluster("WebSocket Handler", graph_attr={"bgcolor": "#1a1f2e", "fontcolor": "#94a3b8", "style": "rounded"}):
        fn_ws      = Lambda("Lambda\nWS connect/msg")
        dyn_conns  = Dynamodb("DynamoDB\nconnection\nregistry")
        fn_ws >> dyn_conns

    with Cluster("Security & Config", graph_attr={"bgcolor": "#1a1f2e", "fontcolor": "#94a3b8", "style": "rounded"}):
        secrets = SecretsManager("Secrets Manager\nAPI keys")
        ssm     = SystemsManagerParameterStore("SSM Param Store\nmodel names\nbudget limits\ncache TTLs")

    with Cluster("Observability", graph_attr={"bgcolor": "#1a1f2e", "fontcolor": "#94a3b8", "style": "rounded"}):
        cw   = Cloudwatch("CloudWatch\nLogs · Metrics\ncustom namespace")
        xray = XRay("X-Ray\ndistributed\ntracing")

    # User traffic
    user >> cf
    user >> alb
    user >> apigw >> fn_ws

    # API routing
    alb >> ecs_api
    ecs_api >> sqs

    # Data access — API
    ecs_api >> Edge(color="#6366f1") >> rds
    ecs_api >> Edge(color="#6366f1") >> redis
    ecs_api >> Edge(color="#6366f1") >> s3tpl

    # Data access — Workers
    ecs_worker >> Edge(color="#22c55e") >> rds
    ecs_worker >> Edge(color="#22c55e") >> redis
    ecs_worker >> Edge(color="#22c55e") >> s3tpl

    # Budget middleware (runs inside Fargate tasks)
    ecs_api    >> Edge(color="#f87171", style="dashed") >> dynamo
    ecs_worker >> Edge(color="#f87171", style="dashed") >> dynamo
    dynamo     >> Edge(color="#f87171", style="dashed") >> sns

    # Secrets access
    ecs_api    >> Edge(color="#94a3b8", style="dotted") >> secrets
    ecs_worker >> Edge(color="#94a3b8", style="dotted") >> secrets
    ecs_api    >> Edge(color="#94a3b8", style="dotted") >> ssm

    # Observability
    ecs_api    >> Edge(color="#475569", style="dotted") >> cw
    ecs_worker >> Edge(color="#475569", style="dotted") >> cw
    ecs_api    >> Edge(color="#475569", style="dotted") >> xray
    ecs_worker >> Edge(color="#475569", style="dotted") >> xray
