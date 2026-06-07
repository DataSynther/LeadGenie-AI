from diagrams import Diagram, Cluster, Edge
from diagrams.aws.compute import Lambda
from diagrams.aws.database import RDS, Dynamodb
from diagrams.aws.network import CloudFront, APIGateway
from diagrams.aws.storage import S3
from diagrams.aws.integration import SNS, SQS
from diagrams.aws.security import SecretsManager
from diagrams.aws.management import Cloudwatch
from diagrams.aws.general import User
from diagrams.aws.engagement import SES
from diagrams.onprem.client import Users

graph_attr = {
    "fontsize": "20",
    "bgcolor": "#0f1117",
    "fontcolor": "#e2e8f0",
    "pad": "0.8",
    "ranksep": "1.0",
    "nodesep": "0.6",
    "splines": "ortho",
}

node_attr = {
    "fontsize": "11",
    "fontcolor": "#e2e8f0",
}

with Diagram(
    "LeadGenie-AI  ·  V1 Demo (Serverless, No ECS)",
    filename="/tmp/leadgenie_v1_demo",
    outformat="png",
    show=False,
    direction="LR",
    graph_attr=graph_attr,
    node_attr=node_attr,
):
    user = Users("Browser")

    with Cluster("CDN / Edge", graph_attr={"bgcolor": "#1a1f2e", "fontcolor": "#94a3b8", "style": "rounded"}):
        cf   = CloudFront("CloudFront")
        spa  = S3("S3\nReact SPA")
        cf >> spa

    with Cluster("API Layer", graph_attr={"bgcolor": "#1a1f2e", "fontcolor": "#94a3b8", "style": "rounded"}):
        apigw = APIGateway("API Gateway\nHTTP API")
        fn_api = Lambda("Lambda\nFastAPI / Mangum\n(API handler)")
        apigw >> fn_api

    with Cluster("Agent Execution", graph_attr={"bgcolor": "#1a1f2e", "fontcolor": "#94a3b8", "style": "rounded"}):
        sqs      = SQS("SQS\nAgent Job Queue")
        fn_agent = Lambda("Lambda\nAgent Runner\n(15 min timeout)")
        sqs >> fn_agent

    with Cluster("Memory Stores", graph_attr={"bgcolor": "#1a1f2e", "fontcolor": "#94a3b8", "style": "rounded"}):
        rds    = RDS("RDS Postgres\nt3.micro\n(episodic · semantic\nlead profile · outreach\npgvector extension)")
        dynamo = Dynamodb("DynamoDB\non-demand\n(FinOps counters\nbudget limits\nsimple cache)")
        s3tpl  = S3("S3\nTemplates\n& KB docs\n(procedural mem)")

    with Cluster("Budget & Alerts", graph_attr={"bgcolor": "#1e1515", "fontcolor": "#fca5a5", "style": "rounded"}):
        fn_budget = Lambda("Lambda\nBudget Middleware\n(token counter)")
        sns       = SNS("SNS\nAlert Topic")
        ses       = SES("SES\nEmail Alerts")
        fn_budget >> sns >> ses

    with Cluster("Security & Observability", graph_attr={"bgcolor": "#1a1f2e", "fontcolor": "#94a3b8", "style": "rounded"}):
        secrets = SecretsManager("Secrets Manager\nAPI keys")
        cw      = Cloudwatch("CloudWatch\nLogs & Metrics")

    # Traffic flow
    user >> cf
    user >> apigw
    fn_api >> sqs

    # Data access
    fn_api   >> Edge(color="#6366f1") >> rds
    fn_api   >> Edge(color="#6366f1") >> dynamo
    fn_api   >> Edge(color="#6366f1") >> s3tpl
    fn_agent >> Edge(color="#22c55e") >> rds
    fn_agent >> Edge(color="#22c55e") >> dynamo
    fn_agent >> Edge(color="#22c55e") >> s3tpl

    # Budget middleware triggered by agent
    fn_agent >> Edge(color="#f87171", style="dashed") >> fn_budget
    fn_api   >> Edge(color="#f87171", style="dashed") >> fn_budget
    fn_budget >> Edge(color="#f87171") >> dynamo

    # Secrets read by lambdas
    fn_api   >> Edge(color="#94a3b8", style="dotted") >> secrets
    fn_agent >> Edge(color="#94a3b8", style="dotted") >> secrets

    # Logging
    fn_api   >> Edge(color="#475569", style="dotted") >> cw
    fn_agent >> Edge(color="#475569", style="dotted") >> cw
