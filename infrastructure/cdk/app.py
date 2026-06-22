#!/usr/bin/env python3
import os
import aws_cdk as cdk
from stacks.vpc_stack      import VpcStack
from stacks.data_stack     import DataStack
from stacks.compute_stack  import ComputeStack
from stacks.frontend_stack import FrontendStack
from stacks.monitoring_stack import MonitoringStack

app = cdk.App()

env = cdk.Environment(
    account=os.environ["CDK_DEFAULT_ACCOUNT"],
    region=os.environ.get("CDK_DEFAULT_REGION", "us-east-1"),
)

vpc_stack     = VpcStack(app,     "VpcStack",     env=env)
data_stack    = DataStack(app,    "DataStack",    vpc=vpc_stack.vpc, redis_sg=vpc_stack.redis_sg, efs_sg=vpc_stack.efs_sg, env=env)
compute_stack = ComputeStack(app, "ComputeStack",
    vpc=vpc_stack.vpc,
    alb_sg=vpc_stack.alb_sg,
    app_sg=vpc_stack.app_sg,

    redis=data_stack.redis,
    activity_table=data_stack.activity_table,
    budget_table=data_stack.budget_table,
    queue_table=data_stack.queue_table,
    secret=data_stack.app_secret,
    api_image=os.environ.get("API_IMAGE", ""),
    worker_image=os.environ.get("WORKER_IMAGE", ""),
    env=env,
)
frontend_stack = FrontendStack(app, "FrontendStack",
    alb_dns=cdk.Fn.import_value("AlbDns"),
    env=env,
)
monitoring_stack = MonitoringStack(app, "MonitoringStack",
    cluster=compute_stack.cluster,
    api_service=compute_stack.api_service,
    worker_service=compute_stack.worker_service,
    activity_table=data_stack.activity_table,
    budget_table=data_stack.budget_table,
    alert_email=os.environ.get("ALERT_EMAIL", ""),
    env=env,
)

# Explicit dependency ordering
data_stack.add_dependency(vpc_stack)
compute_stack.add_dependency(data_stack)
frontend_stack.add_dependency(compute_stack)
monitoring_stack.add_dependency(compute_stack)

app.synth()
