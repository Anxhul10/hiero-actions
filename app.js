import dotenv from 'dotenv'
import fs from 'fs'
import http from 'http'
import { Octokit, App } from 'octokit'
import { createNodeMiddleware } from '@octokit/webhooks'
import yaml from 'js-yaml'

// Load environment variables from .env file
dotenv.config()

// Set configured values
const appId = process.env.APP_ID
const privateKeyPath = process.env.PRIVATE_KEY_PATH
const privateKey = fs.readFileSync(privateKeyPath, 'utf8')
const secret = process.env.WEBHOOK_SECRET
const enterpriseHostname = process.env.ENTERPRISE_HOSTNAME
// const messageForNewPRs = fs.readFileSync('./message.md', 'utf8')
const messageForSignedCommits = fs.readFileSync('./signedCommit.md', 'utf-8')
const msgForUnsignedCommits = fs.readFileSync('./unsignedCommit.md', 'utf-8')
const msgForDisableSign = fs.readFileSync('./disableSign.md', 'utf-8')

// Create an authenticated Octokit client authenticated as a GitHub App
const app = new App({
  appId,
  privateKey,
  webhooks: {
    secret
  },
  ...(enterpriseHostname && {
    Octokit: Octokit.defaults({
      baseUrl: `https://${enterpriseHostname}/api/v3`
    })
  })
})

// Optional: Get & log the authenticated app's name
const { data } = await app.octokit.request('/app')

// Read more about custom logging: https://github.com/octokit/core.js#logging
app.octokit.log.debug(`Authenticated as '${data.name}'`)

// Subscribe to the "pull_request.opened" webhook event
app.webhooks.on('pull_request', async ({ octokit, payload }) => {
  console.log(`Received a pull request event for #${payload.pull_request.number}`)

  await octokit.request(
  'POST /repos/{owner}/{repo}/actions/workflows/{workflow_id}/dispatches',
    {
      owner: 'Anxhul10',
      repo: 'hiero-actions',
      workflow_id: 'manual_trigger.yaml',
      ref: 'main'
    }
  )

  console.log('Workflow dispatch triggered!')

  try {
    // check commit is signed or not
    // Read config file from target repository
    console.log(payload.repository.owner.login)
    console.log(payload.repository.name)
    // Note: .github/config.yaml is read from the main(default branch not the current branch ie test-1)
    const configFile = await octokit.rest.repos.getContent({
      owner: payload.repository.owner.login,
      repo: payload.repository.name,
      path: '.github/config.yaml'
    })

    const configContent = Buffer
      .from(configFile.data.content, 'base64')
      .toString('utf8')

    const parsedConfig = yaml.load(configContent)

    if (parsedConfig.automation.require_sign_commit === true) {
      // Fetch PR commits
      const commits = await octokit.rest.pulls.listCommits({
        owner: payload.repository.owner.login,
        repo: payload.repository.name,
        pull_number: payload.pull_request.number
      })

      const hasUnsigned = commits.data.some(
        (c) => !c.commit.verification.verified
      )

      console.log(hasUnsigned)

      if (hasUnsigned) {
        await octokit.rest.issues.createComment({
          owner: payload.repository.owner.login,
          repo: payload.repository.name,
          issue_number: payload.pull_request.number,
          body: msgForUnsignedCommits
        })
      } else {
        await octokit.rest.issues.createComment({
          owner: payload.repository.owner.login,
          repo: payload.repository.name,
          issue_number: payload.pull_request.number,
          body: messageForSignedCommits
        })
      }
      console.log('running signned checks')
    } else {
      await octokit.rest.issues.createComment({
        owner: payload.repository.owner.login,
        repo: payload.repository.name,
        issue_number: payload.pull_request.number,
        body: msgForDisableSign
      })
    }

    // await octokit.rest.issues.createComment({
    //   owner: payload.repository.owner.login,
    //   repo: payload.repository.name,
    //   issue_number: payload.pull_request.number,
    //   body: messageForNewPRs
    // })
  } catch (error) {
    if (error.response) {
      console.error(`Error! Status: ${error.response.status}. Message: ${error.response.data.message}`)
    } else {
      console.error(error)
    }
  }
})

// Optional: Handle errors
app.webhooks.onError((error) => {
  if (error.name === 'AggregateError') {
    // Log Secret verification errors
    console.log(`Error processing request: ${error.event}`)
  } else {
    console.log(error)
  }
})

// Launch a web server to listen for GitHub webhooks
const port = process.env.PORT || 3000
const path = '/api/webhook'
const localWebhookUrl = `http://localhost:${port}${path}`

// See https://github.com/octokit/webhooks.js/#createnodemiddleware for all options
const middleware = createNodeMiddleware(app.webhooks, { path })

http.createServer(middleware).listen(port, () => {
  console.log(`Server is listening for events at: ${localWebhookUrl}`)
  console.log('Press Ctrl + C to quit.')
})
