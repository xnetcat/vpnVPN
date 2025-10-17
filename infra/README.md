Infrastructure (Pulumi TypeScript)

Stacks:

- global: creates shared resources (ECR repo, control plane, observability)
- region-us-east-1: VPC, EC2 Auto Scaling Group, NLB (UDP/TCP)

See `pulumi` subfolder for project files.

Key configs (region stack):

- `region:imageTag`
- `region:minInstances` / `region:maxInstances`
- `region:instanceType`
- `region:adminCidr`
- `region:targetSessionsPerInstance`
