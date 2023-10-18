import { TodoistApi } from '@doist/todoist-api-typescript'
import { Config, Context } from '@netlify/functions'
import {
  IssuesOpenedEvent,
  IssuesAssignedEvent,
  IssuesLabeledEvent,
  IssuesUnlabeledEvent,
  IssuesUnassignedEvent,
  Issue,
  IssuesClosedEvent,
} from '@octokit/webhooks-types'

import { verifyGithubEvent } from './validation'

const GITHUB_USERNAME = 'james-camilleri'
const VALID_ACTIONS = new Set([
  'opened',
  'assigned',
  'unassigned',
  'labeled',
  'unlabeled',
  'closed',
])
const LABEL_WHITELIST = new Set([
  'bug',
  'enhancement',
  'critical',
  'size: small',
  'size: medium',
  'size: large',
])

const GITHUB_WEBHOOK_SECRET = process.env.GITHUB_ISSUES_WEBHOOK_SECRET
const TODOIST_API_KEY = process.env.TODOIST_API_KEY

function urlToMarkdown(url: string) {
  return `[${url}](${url})`
}

async function getTaskForIssue(issue: Issue, projectId: string, todoist: TodoistApi) {
  const tasks = await todoist.getTasks({ projectId })
  return tasks.filter(
    (task) => task.content === issue.title && task.description === urlToMarkdown(issue.url),
  )[0]
}

async function syncGitHubIssue(
  event:
    | IssuesOpenedEvent
    | IssuesAssignedEvent
    | IssuesLabeledEvent
    | IssuesUnlabeledEvent
    | IssuesUnassignedEvent
    | IssuesClosedEvent,
  projectId: string,
  todoist: TodoistApi,
) {
  const { issue } = event

  if (!issue.assignees.some((assignee) => assignee.login === GITHUB_USERNAME)) {
    console.warn(`Issue not assigned to user ${GITHUB_USERNAME} `)
    return
  }

  const task = await getTaskForIssue(event.issue, projectId, todoist)
  console.debug('Got task for issue', task)
  const isIssueClosed = event.action === 'closed'
  console.debug('Issue is closed', isIssueClosed)

  if (isIssueClosed) {
    if (task) {
      console.debug('Closing task', task.id)
      await todoist.closeTask(task.id)
    }

    return
  }

  const labels = issue.labels
    ?.map((label) => label.name)
    .filter((label) => LABEL_WHITELIST.has(label))
  const taskDetails = {
    content: issue.title,
    description: urlToMarkdown(issue.url),
    labels,
  }

  return task ? await todoist.updateTask(task.id, taskDetails) : await todoist.addTask(taskDetails)
}

export default async (request: Request, context: Context) => {
  if (!GITHUB_WEBHOOK_SECRET || !TODOIST_API_KEY) {
    return new Response('Webhook configured incorrectly', { status: 500 })
  }

  const event = await verifyGithubEvent(request, GITHUB_WEBHOOK_SECRET)
  if (!event) {
    return new Response('Invalid signature', { status: 401 })
  }

  const eventType = request.headers.get('x-github-event')
  const { action } = event
  if (eventType !== 'issues' || !VALID_ACTIONS.has(action)) {
    return new Response(`Event "${eventType}.${action}" is not valid for this webhook`, {
      status: 405,
    })
  }

  const todoistProjectId = context.params['projectId']
  const todoist = new TodoistApi(TODOIST_API_KEY)

  try {
    await todoist.getProject(todoistProjectId)
  } catch {
    return new Response('Todoist project not found', { status: 404 })
  }

  try {
    await syncGitHubIssue(event, todoistProjectId, todoist)
  } catch (e) {
    console.error(e)
    return new Response('Something went wrong when syncing the GitHub issue to Todoist', {
      status: 500,
    })
  }

  return new Response('Called GitHub to Todoist webhook')
}

export const config: Config = {
  path: '/github-to-todoist/:projectId',
}
