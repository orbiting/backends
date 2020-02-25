const { ensureSignedIn } = require('@orbiting/backend-modules-auth')
const {
  findById,
  ensureReadyToSubmit,
  transformQuestion,
  updateResultIncrementally
} = require('../../../lib/Questionnaire')
const {
  validateAnswer
} = require('../../../lib/Question')
const Promise = require('bluebird')

module.exports = async (_, { answer }, context) => {
  const { pgdb, user: me, t, req } = context
  ensureSignedIn(req, t)

  const { id, questionId, payload } = answer

  const transaction = await pgdb.transactionBegin()
  try {
    const now = new Date()
    const question = await transaction.public.questions.findOne({ id: questionId })
    if (!question) {
      throw new Error(t('api/questionnaire/question/404'))
    }

    const questionnaire = await findById(question.questionnaireId, transaction)
    await ensureReadyToSubmit(questionnaire, me.id, now, { ...context, pgdb: transaction })

    // check client generated ID
    const [existingAnswer, answerToSameQuestion] = await Promise.all([
      transaction.public.answers.findOne({ id }),
      transaction.public.answers.findOne({
        'id !=': id,
        userId: me.id,
        questionId
      })
    ])
    if (existingAnswer) {
      if (existingAnswer.userId !== me.id) {
        throw new Error(t('api/questionnaire/answer/idExists'))
      }
      if (existingAnswer.questionId !== questionId) {
        throw new Error(t('api/questionnaire/answer/noQuestionRemapping'))
      }
    }
    if (
      (existingAnswer && existingAnswer.submitted) ||
      (answerToSameQuestion && answerToSameQuestion.submitted)
    ) {
      throw new Error(t('api/questionnaire/answer/immutable'))
    }

    if (answerToSameQuestion) {
      await transaction.public.answers.updateOne(
        { id: answerToSameQuestion.id },
        { id }
      )
      answerToSameQuestion.id = id
    }

    // validate
    let emptyAnswer = false
    if (!payload) {
      emptyAnswer = true
    } else {
      // validate payload
      if (payload.value === undefined || payload.value === null) {
        throw new Error(t('api/questionnaire/answer/empty'))
      }

      emptyAnswer = await validateAnswer(
        payload.value,
        question,
        {
          ...context,
          pgdb: transaction
        },
        payload
      )
    }

    if (emptyAnswer && questionnaire.noEmptyAnswers) {
      throw new Error(t('api/questionnaire/answer/empty'))
    }

    const previousAnswer = existingAnswer || answerToSameQuestion // only one exists at a time

    // write
    let newAnswer
    const findQuery = { id }
    if (emptyAnswer) {
      if (previousAnswer) {
        await transaction.public.answers.deleteOne(findQuery)
      }
    } else {
      if (previousAnswer) {
        newAnswer = await transaction.public.answers.updateAndGetOne(
          findQuery,
          {
            questionId,
            payload,
            updatedAt: now
          }
        )
      } else {
        newAnswer = await transaction.public.answers.insertAndGet({
          id,
          questionId,
          questionnaireId: questionnaire.id,
          userId: me.id,
          payload,
          submitted: questionnaire.submitAnswersImmediately
        })
      }
    }

    let updatedQuestionnaire
    if (questionnaire.updateResultIncrementally) {
      updatedQuestionnaire = await updateResultIncrementally(
        questionnaire.id,
        newAnswer,
        previousAnswer,
        transaction,
        context
      )
    }

    await transaction.transactionCommit()

    return transformQuestion(question, updatedQuestionnaire || questionnaire)
  } catch (e) {
    await transaction.transactionRollback()
    throw e
  }
}
