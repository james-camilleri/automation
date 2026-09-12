import type { Config } from '@netlify/functions'

import { api } from 'ynab'

const YNAB_ACCESS_TOKEN = 'DD-9YjuVUOHguYeMHenSFSSE-egZeawg0tFCcE8mFv8' //process.env.YNAB_ACCESS_TOKEN
const YNAB_BUDGETS = 'cee3eb9e-d5a1-452f-9e18-0463d35bec2a,08fe998f-f717-420b-a8f5-51fb170423aa'.split(',')

function getBudgetCurrency(api: api, budgetId: string) {
  return api.plans
    .getPlanSettingsById(budgetId)
    .then((response) => response.data.settings.currency_format.iso_code)
}

const ynabTaxCalculator = async () => {
  if (!YNAB_ACCESS_TOKEN) {
    console.error('YNAB access token missing')
    return
  }

  const ynab = new api(YNAB_ACCESS_TOKEN)

  try {
    const today = new Date()
    // Tax year starts on the 6th April.
    const taxYearStart =
      today.getMonth() > 3 || (today.getMonth() === 3 && today.getDate() >= 6)
        ? new Date(today.getFullYear(), 3, 6)
        : new Date(today.getFullYear() - 1, 3, 6)

    const taxYearEnd = new Date(taxYearStart)
    taxYearEnd.setDate(taxYearEnd.getDate() - 1)
    taxYearEnd.setFullYear(taxYearEnd.getFullYear() + 1)

    console.log(`💸 Calculating tax for the period ${taxYearStart.toISOString()} to ${taxYearEnd.toISOString()}`)

    const budgetData = await Promise.all(
      YNAB_BUDGETS.map(async (budgetId) => {
        const {
          data: { transactions },
        } = await ynab.transactions.getTransactions(budgetId, taxYearStart.toISOString(), undefined)

        const currency = await getBudgetCurrency(ynab, budgetId)

        return { budgetId, currency, transactions }
      }),
    )

    const gbpBudgetId = budgetData.find(({ currency }) => currency === 'GBP')?.budgetId

    if (!gbpBudgetId) {
      throw Error('GBP budget not found.')
    }

    const transactions = (
      await Promise.all(
        budgetData.map(async ({ budgetId, transactions }) => {
          const currency = await getBudgetCurrency(ynab, budgetId)
          let filteredTransactions = transactions.filter((t) => t.flag_name === 'Taxable Income')

          if (currency !== 'GBP') {
            filteredTransactions = await Promise.all(
              filteredTransactions.map(async (t) => {
                const { date } = t
                const exchangeRate = await fetch(
                  `https://api.frankfurter.dev/v2/rates?date=${date}&quotes=${currency}&base=GBP`,
                )
                  .then(async (res) => res.json())
                  .then((data) => data[0].rate)

                return {
                  ...t,
                  amount: t.amount / exchangeRate, // Convert from original currency to GBP
                }
              }),
            )
          }

          return filteredTransactions
        }),
      )
    ).flat()

    const totalIncome = transactions.reduce((sum, t) => sum + t.amount, 0)
    const tax = totalIncome * 0.45

    console.log(`💸 Total taxable income: £${(totalIncome / 1000).toFixed(2)} (${transactions.length} transactions)`)
    console.log(`💸 Total tax owed:       £${(tax / 1000).toFixed(2)}`)

    // console.log(
    //   transactions
    //     .map(
    //       (t) =>
    //         `${t.payee_name}${t.memo ? ` (${t.memo})` : ''} £${(t.amount / 1000).toFixed(2)} x 0.45 = £${(
    //           (t.amount * 0.45) /
    //           1000
    //         ).toFixed(2)}`,
    //     )
    //     .join('\n'),
    // )

    const taxCategory = (await ynab.categories.getCategories(gbpBudgetId)).data.category_groups
      .map((categoryGroup) => categoryGroup.categories)
      .flat()
      .find((category) => category.name === 'Tax')

    if (!taxCategory) {
      throw Error('Tax category not found.')
    }

    await ynab.categories.updateCategory(gbpBudgetId, taxCategory.id, {
      category: {
        goal_target: tax,
        goal_target_date: taxYearEnd.toISOString().split('T')[0],
        goal_needs_whole_amount: false
      },
    })
  } catch (e) {
    console.error(e)
  }
}

export default ynabTaxCalculator
export const config: Config = {
  // Midnight every day.
  schedule: '0 0 * * *',
}
