import type { Config } from '@netlify/functions'

import { getStore } from '@netlify/blobs'
import { api } from 'ynab'

import { YnabWebhookPayload } from '../_shared/types'

const YNAB_ACCESS_TOKEN = process.env.YNAB_ACCESS_TOKEN
const YNAB_BUDGETS = (process.env.YNAB_BUDGETS ?? '').split(',')

const STORE_ID = 'ynab'
const STORE_KEY_PREFIX = 'last_knowledge_'

const WEBHOOK_ENDPOINT = 'https://automation.james.mt/ynab-to-todoist'

export default async () => {
  if (!YNAB_ACCESS_TOKEN) {
    console.error('YNAB access token missing')
    return
  }

  const ynab = new api(YNAB_ACCESS_TOKEN)
  const store = getStore(STORE_ID)

  try {
    const newBudgetData = await Promise.all(
      YNAB_BUDGETS.map(async (budgetId) => {
        const key = `${STORE_KEY_PREFIX}${budgetId}`
        const lastKnowledgeOfServer = Number.parseInt(await store.get(key))

        const {
          data: { transactions, server_knowledge },
        } = await ynab.transactions.getTransactions(
          budgetId,
          undefined,
          undefined,
          lastKnowledgeOfServer,
        )

        return { budgetId, lastKnowledgeOfServer: server_knowledge.toString(), transactions }
      }),
    )

    const webhookPayload = newBudgetData.reduce(
      (webhookPayload, { budgetId, transactions }) => ({
        ...webhookPayload,
        [budgetId]: transactions,
      }),
      {} as YnabWebhookPayload,
    )

    const response = await fetch(WEBHOOK_ENDPOINT, {
      method: 'POST',
      body: JSON.stringify(webhookPayload),
    })

    if (response.ok) {
      await Promise.all(
        newBudgetData.map(({ budgetId, lastKnowledgeOfServer }) =>
          store.set(`${STORE_KEY_PREFIX}${budgetId}`, lastKnowledgeOfServer),
        ),
      )
    }
  } catch (e) {
    console.error(e)
  }
}

export const config: Config = {
  // Every 5 minutes.
  schedule: '*/5 * * * *',
}
