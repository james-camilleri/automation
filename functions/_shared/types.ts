import { TransactionDetail } from 'ynab'

export interface YnabWebhookPayload {
  [budgetId: string]: TransactionDetail[]
}
