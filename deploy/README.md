# Deploying

Pushing to `main` or a `claude/**` branch runs `.github/workflows/deploy.yml`, which
deploys that exact commit to the EC2 game server (instance `i-00966cc1ee771d0cc`, us-west-1)
through SSM. Auth is keyless GitHub OIDC; no secrets live in GitHub.

## One-time AWS setup (needs AWS access, do once)
1. Create the OIDC provider `token.actions.githubusercontent.com` (audience `sts.amazonaws.com`) if the account has none.
2. Create role `island-night-github-deploy`, trust policy limited to
   `token.actions.githubusercontent.com:sub` StringLike
   `repo:aalkouri/girl_game:ref:refs/heads/main` and `repo:aalkouri/girl_game:ref:refs/heads/claude/*`
   (and `aud` = `sts.amazonaws.com`).
3. Permissions: `ssm:SendCommand` on the instance and on the `AWS-RunShellScript` document;
   `ssm:GetCommandInvocation`, `ssm:ListCommandInvocations`.
4. Put the AWS account ID in place of `ACCOUNT_ID_HERE` in the workflow.
