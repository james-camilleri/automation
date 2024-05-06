import { TodoistApi } from '@doist/todoist-api-typescript'
import { Config } from '@netlify/functions'
import { api } from 'ynab'

import { YnabWebhookPayload } from '../_shared/types'

const TODOIST_API_KEY = process.env.TODOIST_API_KEY
const YNAB_ACCESS_TOKEN = process.env.YNAB_ACCESS_TOKEN

const OWED_YNAB_CATEGORY_NAME = 'Money Owed'
const OWED_TODOIST_PROJECT_ID = '2230293849'

function validatePayload(payload: unknown): payload is YnabWebhookPayload {
  return (
    typeof payload === 'object' &&
    Object.values(payload as object).every((value) => Array.isArray(value) && 'amount' in value[0])
  )
}

function formatAmount(amount: number) {
  const amountString = amount.toString()
  const major = amountString.slice(0, -2)
  const minor = amountString.slice(-2)

  let formatted = major

  if (minor !== '00') {
    formatted += `.${minor}`
  }

  return formatted
}

export default async (request: Request) => {
  if (!TODOIST_API_KEY) {
    console.error('Todoist API key missing')
    return new Response('Webhook configured incorrectly', { status: 500 })
  }

  if (!YNAB_ACCESS_TOKEN) {
    console.error('YNAB access token missing')
    return new Response('Webhook configured incorrectly', { status: 500 })
  }

  const ynab = new api(YNAB_ACCESS_TOKEN)
  const todoist = new TodoistApi(TODOIST_API_KEY)

  const payload = (JSON.parse((await request.json()) ?? '') ?? {}) as YnabWebhookPayload
  console.info('Received payload', payload)

  if (!validatePayload(payload)) {
    console.error('Invalid payload', payload)
    return new Response('Invalid payload', { status: 400 })
  }

  try {
    await Promise.all(
      Object.entries(payload).map(async ([budgetId, transactions]) => {
        const transactionsToProcess = transactions.filter(
          ({ category_name }) => category_name === OWED_YNAB_CATEGORY_NAME,
        )
        console.info('Transactions to process', transactionsToProcess)

        if (transactionsToProcess.length === 0) {
          console.info('No transactions to process', transactionsToProcess)
          return
        }

        const currency =
          (await ynab.budgets.getBudgetSettingsById(budgetId)).data.settings.currency_format
            ?.display_symbol ?? ''

        console.info('Currency', currency)

        const tasks = transactionsToProcess.map(({ amount, date, memo, payee_name }) => {
          let task = `(${currency ? `${currency} ` : ''}${formatAmount(amount)}) `

          if (memo) {
            task += `${memo}, `
          }
          task += payee_name

          return {
            content: task,
            description: Intl.DateTimeFormat('en-GB', { dateStyle: 'short' }).format(
              new Date(date),
            ),
          }
        })

        console.info('Tasks', tasks)

        await Promise.all(
          tasks.map(({ content, description }) =>
            todoist.addTask({
              projectId: OWED_TODOIST_PROJECT_ID,
              content,
              description,
            }),
          ),
        )
      }),
    )
  } catch (e) {
    console.error('Error processing new transactions')
    return new Response('Error processing new transactions', { status: 500 })
  }

  return new Response('New transactions added to Todoist')
}

export const config: Config = {
  path: '/ynab-to-todoist',
}
