module.exports = async ({ github, context }) => {
  const owner = context.repo.owner;
  const repo = context.repo.repo;

  const prNumber = process.env.PR_NUMBER;

  const commits = await github.rest.pulls.listCommits({
    owner,
    repo,
    pull_number: prNumber
  });

  const failures = [];

  for (const commit of commits.data) {

    // GPG / verified commit check
    if (!commit.commit.verification.verified) {
      failures.push(`Unverified commit: ${commit.sha}`);
    }

    // DCO check
    if (!commit.commit.message.includes('Signed-off-by:')) {
      failures.push(`Missing DCO signoff: ${commit.sha}`);
    }
  }

  if (failures.length > 0) {
    await github.rest.issues.createComment({
      owner,
      repo,
      issue_number: prNumber,
      body: failures.join('\n')
    });

    core.setFailed('Commit verification failed');
  }
};