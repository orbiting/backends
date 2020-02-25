const { buildQueries } = require('./queries.js')
const queries = buildQueries('questionnaires')

const { resultForArchive } = require('./Question')
const finalizeLib = require('./finalize.js')
const difference = require('lodash/difference')
const debug = require('debug')('voting:questionnaire')

const transformQuestion = (q, questionnaire) => ({
  ...q.typePayload,
  ...q,
  questionnaire
})

const getQuestions = async (questionnaire, args = {}, pgdb) => {
  const { orderFilter } = args
  if (questionnaire.result) {
    return questionnaire.result.questions
      .map(question => ({
        ...question,
        questionnaire
      }))
      .filter(question => !orderFilter || orderFilter.indexOf(question.order) > -1)
  }
  // add turnout to questionnaire for downstream resolvers
  const turnout =
    (questionnaire.result && questionnaire.result.turnout) ||
    questionnaire.turnout ||
    await queries.turnout(questionnaire, pgdb)
  const questionnaireWithTurnout = {
    turnout,
    ...questionnaire
  }
  return pgdb.public.questions.find(
    {
      questionnaireId: questionnaire.id,
      ...orderFilter ? { order: orderFilter } : {}
    },
    { orderBy: { order: 'asc' } }
  )
    .then(questions => questions.map(q => transformQuestion(q, questionnaireWithTurnout)))
}

const getQuestionsWithResults = async (questionnaire, context) => {
  const { pgdb } = context
  return getQuestions(questionnaire, {}, pgdb)
    .then(questions => Promise.all(questions.map(async (question) => {
      return {
        ...question,
        questionnaire: null,
        result: await resultForArchive(question, {}, context) || null
      }
    })))
}

const getResult = async (questionnaire, context) => {
  const { pgdb } = context

  const turnout = await queries.turnout(questionnaire, pgdb)
  const questionnaireWithTurnout = {
    ...questionnaire,
    turnout
  }

  const questions = await getQuestionsWithResults(questionnaireWithTurnout, context)
  const now = new Date()
  return {
    questions,
    turnout,
    updatedAt: now,
    createdAt: questionnaire.result ? questionnaire.result.createdAt : now
  }
}

const finalize = async (questionnaire, args, context) => {
  const result = getResult(questionnaire, context)
  return finalizeLib('questionnaires', questionnaire, result, args, context.pgdb)
}

const updateResultIncrementally = async (questionnaireId, answer, previousAnswer, transaction, context) => {
  const { t } = context

  const questionnaire = await transaction.query(`
    SELECT *
    FROM questionnaires
    WHERE id = :questionnaireId
    FOR UPDATE
  `, {
    questionnaireId
  })
    .then(r => r && r[0])

  if (!questionnaire) {
    throw new Error(t('api/questionnaire/404'))
  }

  let { result, includeUnsubmittedAnswers } = questionnaire
  if (!result) {
    result = await getResult(questionnaire, { ...context, pgdb: transaction })
  }

  const question = result.questions.find(q => q.id === answer.questionId)
  if (!question) {
    throw new Error(t('api/questionnaire/question/404'))
  }
  if (question.type !== 'Choice') {
    throw new Error(t('api/questionnaire/answer/updateResultIncrementally/choiceOnly'))
  }

  const { payload, turnout } = question.result
  if (!payload || !turnout) {
    console.error('result payload or turnout not found')
    throw new Error(t('api/unexpected'))
  }

  const answerValue = (includeUnsubmittedAnswers || answer.submitted)
    ? answer.payload.value
    : null
  const previousAnswerValue = (includeUnsubmittedAnswers || (previousAnswer && previousAnswer.submitted))
    ? previousAnswer && previousAnswer.payload && previousAnswer.payload.value
    : null

  const valueChanged =
    (answerValue && !previousAnswerValue) ||
    (!answerValue && previousAnswerValue) ||
    (Array.isArray(answerValue || previousAnswerValue) && difference(answerValue, previousAnswerValue).length > 0) ||
    (!Array.isArray(answerValue || previousAnswerValue) && previousAnswerValue != answerValue) // eslint-disable-line eqeqeq

  debug({ valueChanged, previousAnswerValue, answerValue, diff: difference(answerValue, previousAnswerValue) })
  if (questionnaire.result && valueChanged) {
    const answerOptionPayload = payload
      .find(p => p.option.value == answerValue) // eslint-disable-line eqeqeq

    const previousAnswerOptionPayload = previousAnswerValue && payload
      .find(p => p.option.value == previousAnswerValue) // eslint-disable-line eqeqeq

    if (!answerOptionPayload || (previousAnswerValue && !previousAnswerOptionPayload)) {
      console.error('optionPayload not found', payload)
      throw new Error(t('api/unexpected'))
    }
    debug({ answerOptionPayload, previousAnswerOptionPayload })

    if (answerValue) {
      answerOptionPayload.count += 1
      if (answer.submitted) {
        turnout.submitted += 1
      }
      if (includeUnsubmittedAnswers || answer.submitted) {
        turnout.counted += 1
      }
    }
    if (previousAnswerValue) {
      previousAnswerOptionPayload.count -= 1
      if (previousAnswer.submitted) {
        turnout.submitted -= 1
      }
      if (includeUnsubmittedAnswers || previousAnswer.submitted) {
        turnout.counted -= 1
      }
    }
    debug({ answerOptionPayload, previousAnswerOptionPayload })

    result.updatedAt = new Date()
  }

  return transaction.public.questionnaires.updateAndGetOne(
    { id: questionnaireId },
    { result }
  )
}

module.exports = {
  ...queries,
  transformQuestion,
  getQuestions,
  finalize,
  updateResultIncrementally
}
