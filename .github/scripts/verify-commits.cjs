module.exports = async ({ github, context }) => {
  const owner = process.env.TARGET_OWNER;
  const repo = process.env.TARGET_REPO;

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
  console.log(failures);
};