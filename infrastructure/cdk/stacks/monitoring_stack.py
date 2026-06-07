from aws_cdk import (
    Stack, Duration, CfnOutput,
    aws_ecs as ecs,
    aws_dynamodb as dynamodb,
    aws_cloudwatch as cloudwatch,
    aws_cloudwatch_actions as cwa,
    aws_sns as sns,
    aws_sns_subscriptions as subscriptions,
    aws_lambda as lambda_,
    aws_lambda_event_sources as lambda_events,
    aws_events as events,
    aws_events_targets as targets,
    aws_apigateway as apigw,
    aws_iam as iam,
    aws_logs as logs,
    aws_budgets as budgets,
)
from constructs import Construct
import os


class MonitoringStack(Stack):
    def __init__(self, scope: Construct, id: str, *,
                 cluster: ecs.Cluster,
                 api_service: ecs.FargateService,
                 worker_service: ecs.FargateService,
                 activity_table: dynamodb.Table,
                 budget_table: dynamodb.Table,
                 alert_email: str,
                 **kwargs):
        super().__init__(scope, id, **kwargs)

        # ── SNS alert topic ───────────────────────────────────────────────────
        self.alert_topic = sns.Topic(self, "AlertTopic",
            topic_name="leadgenie-alerts",
            display_name="LeadGenie-AI Alerts",
        )
        if alert_email:
            self.alert_topic.add_subscription(
                subscriptions.EmailSubscription(alert_email)
            )

        # ── Lambda execution role ─────────────────────────────────────────────
        lambda_role = iam.Role(self, "LambdaRole",
            assumed_by=iam.ServicePrincipal("lambda.amazonaws.com"),
            managed_policies=[
                iam.ManagedPolicy.from_aws_managed_policy_name(
                    "service-role/AWSLambdaBasicExecutionRole"
                ),
            ],
        )
        activity_table.grant_read_data(lambda_role)
        budget_table.grant_read_write_data(lambda_role)
        self.alert_topic.grant_publish(lambda_role)

        # Grant ECS scale permissions to Lambda role
        lambda_role.add_to_policy(iam.PolicyStatement(
            actions=[
                "ecs:UpdateService",
                "ecs:DescribeServices",
                "application-autoscaling:RegisterScalableTarget",
                "application-autoscaling:DeregisterScalableTarget",
            ],
            resources=["*"],
        ))

        # ── Auto-sleep Lambda (checks inactivity every 5 min) ─────────────────
        sleep_fn = lambda_.Function(self, "SleepChecker",
            function_name="leadgenie-sleep-checker",
            runtime=lambda_.Runtime.PYTHON_3_12,
            handler="handler.lambda_handler",
            code=lambda_.Code.from_asset("../../infrastructure/lambdas/sleep_checker"),
            timeout=Duration.minutes(2),
            role=lambda_role,
            environment={
                "ACTIVITY_TABLE":    activity_table.table_name,
                "CLUSTER_NAME":      cluster.cluster_name,
                "API_SERVICE":       api_service.service_name,
                "WORKER_SERVICE":    worker_service.service_name,
                "ALERT_TOPIC_ARN":   self.alert_topic.topic_arn,
                "INACTIVITY_MINUTES": "15",
                "AWS_ACCOUNT_ID":    self.account,
            },
            log_retention=logs.RetentionDays.ONE_WEEK,
        )

        # Run sleep checker every 5 minutes
        events.Rule(self, "SleepCheckerSchedule",
            rule_name="leadgenie-sleep-checker",
            schedule=events.Schedule.rate(Duration.minutes(5)),
            targets=[targets.LambdaFunction(sleep_fn)],
        )

        # ── Wake Lambda (API endpoint to restart sleeping services) ───────────
        wake_fn = lambda_.Function(self, "WakeFn",
            function_name="leadgenie-wake",
            runtime=lambda_.Runtime.PYTHON_3_12,
            handler="handler.lambda_handler",
            code=lambda_.Code.from_asset("../../infrastructure/lambdas/wake"),
            timeout=Duration.minutes(2),
            role=lambda_role,
            environment={
                "CLUSTER_NAME":    cluster.cluster_name,
                "API_SERVICE":     api_service.service_name,
                "WORKER_SERVICE":  worker_service.service_name,
                "ALERT_TOPIC_ARN": self.alert_topic.topic_arn,
            },
            log_retention=logs.RetentionDays.ONE_WEEK,
        )

        wake_api = apigw.RestApi(self, "WakeApi",
            rest_api_name="leadgenie-wake",
            description="Wakes sleeping LeadGenie ECS services",
        )
        wake_api.root.add_method("GET",
            apigw.LambdaIntegration(wake_fn, proxy=True),
        )

        # ── CloudWatch Alarms ─────────────────────────────────────────────────

        # 1. API service has 0 running tasks (sleep state)
        sleep_alarm = cloudwatch.Alarm(self, "ServiceSleepingAlarm",
            alarm_name="leadgenie-service-sleeping",
            alarm_description="ECS API service scaled to 0 — system is sleeping",
            metric=api_service.metric_running_task_count(
                period=Duration.minutes(5),
                statistic="Minimum",
            ),
            threshold=1,
            comparison_operator=cloudwatch.ComparisonOperator.LESS_THAN_THRESHOLD,
            evaluation_periods=1,
            treat_missing_data=cloudwatch.TreatMissingData.BREACHING,
        )
        sleep_alarm.add_alarm_action(cwa.SnsAction(self.alert_topic))

        # 2. High CPU on API tasks (> 80%)
        cpu_alarm = cloudwatch.Alarm(self, "HighCpuAlarm",
            alarm_name="leadgenie-high-cpu",
            alarm_description="API service CPU > 80%",
            metric=api_service.metric_cpu_utilization(
                period=Duration.minutes(5),
                statistic="Average",
            ),
            threshold=80,
            evaluation_periods=2,
        )
        cpu_alarm.add_alarm_action(cwa.SnsAction(self.alert_topic))

        # 3. High error rate (5xx from ECS)
        error_alarm = cloudwatch.Alarm(self, "ErrorRateAlarm",
            alarm_name="leadgenie-error-rate",
            alarm_description="Backend error rate elevated",
            metric=cloudwatch.Metric(
                namespace="AWS/ApplicationELB",
                metric_name="HTTPCode_Target_5XX_Count",
                dimensions_map={"LoadBalancer": "leadgenie-alb"},
                period=Duration.minutes(5),
                statistic="Sum",
            ),
            threshold=10,
            evaluation_periods=2,
            treat_missing_data=cloudwatch.TreatMissingData.NOT_BREACHING,
        )
        error_alarm.add_alarm_action(cwa.SnsAction(self.alert_topic))

        # ── AWS Budgets — hard spend alert ────────────────────────────────────
        budgets.CfnBudget(self, "MonthlyBudget",
            budget=budgets.CfnBudget.BudgetDataProperty(
                budget_name="leadgenie-monthly",
                budget_type="COST",
                time_unit="MONTHLY",
                budget_limit=budgets.CfnBudget.SpendProperty(amount=30, unit="USD"),
            ),
            notifications_with_subscribers=[
                budgets.CfnBudget.NotificationWithSubscribersProperty(
                    notification=budgets.CfnBudget.NotificationProperty(
                        notification_type="ACTUAL",
                        comparison_operator="GREATER_THAN",
                        threshold=50,
                        threshold_type="PERCENTAGE",
                    ),
                    subscribers=[budgets.CfnBudget.SubscriberProperty(
                        subscription_type="EMAIL",
                        address=alert_email or "admin@example.com",
                    )],
                ),
                budgets.CfnBudget.NotificationWithSubscribersProperty(
                    notification=budgets.CfnBudget.NotificationProperty(
                        notification_type="ACTUAL",
                        comparison_operator="GREATER_THAN",
                        threshold=90,
                        threshold_type="PERCENTAGE",
                    ),
                    subscribers=[budgets.CfnBudget.SubscriberProperty(
                        subscription_type="EMAIL",
                        address=alert_email or "admin@example.com",
                    )],
                ),
            ],
        )

        # ── CloudWatch Dashboard ───────────────────────────────────────────────
        cloudwatch.Dashboard(self, "Dashboard",
            dashboard_name="LeadGenie-AI",
            widgets=[
                [
                    cloudwatch.GraphWidget(
                        title="ECS Running Tasks",
                        left=[
                            api_service.metric_running_task_count(period=Duration.minutes(5)),
                            worker_service.metric_running_task_count(period=Duration.minutes(5)),
                        ],
                        width=12,
                    ),
                    cloudwatch.GraphWidget(
                        title="CPU Utilization",
                        left=[
                            api_service.metric_cpu_utilization(period=Duration.minutes(5)),
                            worker_service.metric_cpu_utilization(period=Duration.minutes(5)),
                        ],
                        width=12,
                    ),
                ],
                [
                    cloudwatch.AlarmStatusWidget(
                        title="Alarm Status",
                        alarms=[sleep_alarm, cpu_alarm, error_alarm],
                        width=24,
                    ),
                ],
            ],
        )

        # ── Outputs ────────────────────────────────────────────────────────────
        CfnOutput(self, "AlertTopicArn", value=self.alert_topic.topic_arn, export_name="AlertTopicArn")
        CfnOutput(self, "WakeUrl",       value=wake_api.url,               export_name="WakeUrl")
        CfnOutput(self, "DashboardUrl",
            value=f"https://{self.region}.console.aws.amazon.com/cloudwatch/home#dashboards:name=LeadGenie-AI",
        )
