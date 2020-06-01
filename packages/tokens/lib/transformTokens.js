
module.exports = (tokens) => {
  var transformedTokens = tokens.map(function (token) {
    return {
      id: token.id,
      email: token.email,
      sessionId: token.sessionId,
      createdAt: token.createdAt,
      updatedAt: token.updatedAt,
      expiresAt: token.expiresAt,
      isActive: isActive(token)
    }
  })

  return transformedTokens
}

function isActive (token) {
  return token.expiresAt > Date.now()
}
