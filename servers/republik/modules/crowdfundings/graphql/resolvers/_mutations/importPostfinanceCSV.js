
const Promise = require('bluebird')
const { dsvFormat } = require('d3-dsv')

const { Roles } = require('@orbiting/backend-modules-auth')

const matchPayments = require('../../../lib/payments/matchPayments')
const matchPspId = require('../../../lib/payments/matchPspId')

const logger = console
const csvParse = dsvFormat(';').parse

const parsePostfinanceExport = async (inputFile, pgdb) => {
  // sanitize input
  // trash first 5 lines as they contain another table with (Buchungsart, Konto, etc)
  // keys to lower case
  // trash uninteresting columns
  // parse columns
  // extract mitteilung
  const includeColumns = ['Buchungsdatum', 'Valuta', 'Avisierungstext', 'Gutschrift']
  const parseDate = ['Buchungsdatum', 'Valuta']
  const parseAmount = ['Gutschrift']

  const delimitedFile = inputFile.split(/\r\n/)

  const iban = delimitedFile.slice(0, 5).reduce((acc, row) => {
    const parsedRow = row.match(/^Konto:;([A-Z0-9]{5,34})/)

    if (!parsedRow) {
      return acc
    }

    return parsedRow[1]
  }, false)

  console.log(iban)

  if (!iban) {
    throw new Error('Unable to find IBAN in provided file.')
  }

  const bankAccount = await pgdb.public.bankAccounts.findOne({ iban })
  if (!bankAccount) {
    throw new Error(
      `Unable to determine bank account for IBAN "${iban}" in provided file.`
    )
  }

  return csvParse(delimitedFile.slice(5).join('\n'))
    .filter(row => row.Gutschrift) // trash rows without gutschrift (such as lastschrift and footer)
    .filter(row => !String(row.Avisierungstext).match(/^GUTSCHRIFT VON FREMDBANK AUFTRAGGEBER: (STRIPE|PAYPAL)/m))
    .map(row => {
      let newRow = {}
      Object.keys(row).forEach(key => {
        const value = row[key]
        if (includeColumns.includes(key)) {
          const newKey = key.toLowerCase()
          if (parseDate.indexOf(key) > -1) {
            newRow[newKey] = new Date(value) // dates are ISO Dates (2017-08-17)
          } else if (parseAmount.indexOf(key) > -1) {
            newRow[newKey] = parseInt(parseFloat(value) * 100)
          } else {
            if (key === 'Avisierungstext') {
              // e.g. "GIRO AUS KONTO CH860900000030055xxx ABSENDER: xxx MITTEILUNGEN: 35UX4D Abo Republik 2019"
              // Can be multiline and highly individual text. Prefix "GIRO (...)" must not exist.
              const matchMitteilung = String(value).match(/.*?MITTEILUNGEN:.*?\s([A-Za-z0-9]{6})(\s.*?|$)/m)
              newRow['mitteilung'] = matchMitteilung && matchMitteilung[1]

              // e.g. "GUTSCHRIFT E-PAYMENT TRANSAKTION POSTFINANCE CARD 30.11.2018 Project R Genossenschaft PFAQ01LS0000001 www.project-r.construction PAYMENT ID 4366370170 BESTELLNUMMER 4366370170"
              const matchPspId = String(value).match(/PAYMENT ID (\d+) BESTELLNUMMER \d+/m)
              newRow['pspId'] = matchPspId && matchPspId[1]
            }

            newRow[newKey] = value
          }
        }
      })

      newRow.bankAccountId = bankAccount.id
      return newRow
    })
    .map(row => {
      if (row.pspId) {
        row.hidden = true
      }

      return row
    })
}

const LOG_FAILED_INSERTS = true

const insertPayments = async (payments, { pgdb, now = new Date() }) => {
  const stats = {
    all: payments.length,
    inserts: 0,
    updates: 0,
    failures: 0
  }

  await Promise.each(
    payments,
    async payment => {
      const { buchungsdatum, valuta, avisierungstext, gutschrift } = payment
      const conditions = { buchungsdatum, valuta, avisierungstext, gutschrift }
      const siblingsCount = await pgdb.public.postfinancePayments.count(conditions)

      if (siblingsCount === 1) {
        const fields = { ...payment, updatedAt: now }
        delete fields.mitteilung

        await pgdb.public.postfinancePayments
          .update(conditions, fields)
          .then(() => { stats.updates++ })
          .catch(({ message, detail }) => {
            // swallow errornous uploads
            stats.failures++

            if (LOG_FAILED_INSERTS) {
              console.warn({
                payment,
                error: { message, detail }
              })
            }
          })

        return
      }

      await pgdb.public.postfinancePayments
        .insert(payment)
        .then(() => { stats.inserts++ })
        .catch(({ message, detail }) => {
          // swallow errornous uploads
          stats.failures++

          if (LOG_FAILED_INSERTS) {
            console.warn({
              payment,
              error: { message, detail }
            })
          }
        })
    }
  )

  return stats
}

module.exports = async (_, args, { pgdb, req, t }) => {
  Roles.ensureUserHasRole(req.user, 'accountant')

  const paymentsInput = await parsePostfinanceExport(
    Buffer.from(args.csv, 'base64').toString(), // Buffer(...).toString('latin1') to prevent Umlaute issue
    pgdb
  )

  if (paymentsInput.length < 1) {
    console.log('no payments in input found. done nothing.')
    return 'no payments in input found. done nothing.'
  }

  const now = new Date()
  const numPaymentsBefore = await pgdb.public.postfinancePayments.count()

  // insert into db
  // this is done outside of transaction because it's
  // ment to throw on duplicate rows and doesn't change other records
  const insertSummary = await insertPayments(paymentsInput, { pgdb, now })

  const numPaymentsAfter = await pgdb.public.postfinancePayments.count()

  const transaction = await pgdb.transactionBegin()
  try {
    const {
      numMatchedPayments,
      numUpdatedPledges,
      numPaymentsSuccessful
    } = await matchPayments(transaction, t)

    await matchPspId({ pgdb: transaction, now })

    await transaction.transactionCommit()

    const result = `
importPostfinanceCSV result:
CSV insert summary: ${JSON.stringify(insertSummary)}
num new payments: ${numPaymentsAfter - numPaymentsBefore}
num matched payments: ${numMatchedPayments}
num updated pledges: ${numUpdatedPledges}
num payments successfull: ${numPaymentsSuccessful}
    `
    console.log(result)
    return result
  } catch (e) {
    await transaction.transactionRollback()
    logger.info('transaction rollback', { req: req._log(), args, error: e })
    throw e
  }
}
