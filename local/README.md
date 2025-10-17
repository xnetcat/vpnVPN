Local AWS (LocalStack) notes

- EC2/NLB are not supported in LocalStack community; use real AWS for data-plane tests.
- Use LocalStack to test control-plane subsystems (DynamoDB/S3/Lambda/API GW).

Commands:

- docker compose -f local/compose.yaml up -d
- export AWS_ENDPOINT_URL=http://localhost:4566
