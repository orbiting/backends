const { ApolloServer } = require('apollo-server-express')
const { makeExecutableSchema } = require('apollo-server')

const cookie = require('cookie')
const cookieParser = require('cookie-parser')
const { transformUser } = require('@orbiting/backend-modules-auth')
const util = require('util')
const uuid = require('uuid/v4')

const {
  NODE_ENV,
  WS_KEEPALIVE_INTERVAL,
  RES_KEEPALIVE,
  WS_TRACK
} = process.env

const getContextForWebsocket = async ({ pgdb, createContext }, { connectionParams, websocket }) => {
  try {
    // apollo-fetch used in tests sends cookie on the connectionParams
    const cookiesRaw = (NODE_ENV === 'development' && connectionParams.cookies)
      ? connectionParams.cookies
      : websocket.upgradeReq.headers.cookie
    if (!cookiesRaw) {
      return createContext()
    }
    const cookies = cookie.parse(cookiesRaw)
    const sid = cookieParser.signedCookie(
      cookies['connect.sid'],
      process.env.SESSION_SECRET
    )
    const session = sid && await pgdb.public.sessions.findOne({ sid })
    if (session && session.sess && session.sess.passport && session.sess.passport.user) {
      const user = await pgdb.public.users.findOne({ id: session.sess.passport.user })
      return createContext({
        user: transformUser(user)
      })
    }
    return createContext()
  } catch (e) {
    console.error('error in subscriptions.onConnect', e)
    // throwing inside onConnect disconnects the client
    throw new Error('error in subscriptions.onConnect')
  }
}

// 1. the server gets itself an id and adds it to set (key: servers)
// 2. server manages set (key: servers:${serverId}) of websocket connection ids
const { zRangeUnexpiredAndGC } = require('../lib/Redis')
const WsTracker = (redis) => {
  const serversSetKey = `servers`
  const serversTTLSecs = 15
  const serverId = uuid()
  const serverWsSetKey = `${serversSetKey}:${serverId}:ws`

  setInterval(() => {
    const now = new Date().getTime()
    redis.zadd(serversSetKey, now, serverId)
    zRangeUnexpiredAndGC(redis, serversSetKey, serversTTLSecs * 1000)

    redis.expireAsync(serverWsSetKey, serversTTLSecs)
  }, 1000 * (serversTTLSecs - 5)).unref()

  return {
    onConnect: (ws) => {
      ws.id = uuid()
      redis.saddAsync(serverWsSetKey, ws.id)
        .catch(e => { console.log(e) })
      redis.expireAsync(serverWsSetKey, serversTTLSecs)
        .catch(e => { console.log(e) })
    },
    onDisconnect: (ws) => {
      if (!ws.id) {
        console.log('websocket without id')
        return
      }
      redis.srem(serverWsSetKey, ws.id)
    }
  }
}

module.exports = (
  server,
  httpServer,
  pgdb,
  redis,
  graphqlSchema,
  createGraphqlContext = identity => identity
) => {
  const wsTracker = WS_TRACK && WsTracker(redis)

  const executableSchema = makeExecutableSchema(graphqlSchema)

  const createContext = ({ user, ...context } = {}) => createGraphqlContext({
    ...context,
    user: (global && global.testUser !== undefined)
      ? global.testUser
      : user
  })

  const apolloServer = new ApolloServer({
    schema: executableSchema,
    context: ({ req, connection }) => connection
      ? connection.context
      : createContext({ user: req.user, req }),
    debug: true,
    introspection: true,
    playground: false, // see ./graphiql.js
    subscriptions: {
      onDisconnect: (ws) => {
        if (wsTracker) {
          wsTracker.onDisconnect(ws)
        }
      },
      onConnect: async (connectionParams, websocket) => {
        const context = await getContextForWebsocket({ pgdb, createContext }, { connectionParams, websocket })
        if (wsTracker) {
          wsTracker.onConnect(websocket)
        }
        return context
      },
      keepAlive: WS_KEEPALIVE_INTERVAL || 40000
    },
    formatError: (error) => {
      console.log(
        `graphql error in ${this.operationName} (${JSON.stringify(this.variables)}):`,
        util.inspect(error, { depth: null, colors: true, breakLength: 300 })
      )
      delete error.extensions.exception
      return error
    },
    formatResponse: (response, { context }) => {
      // strip problematic character (\u2028) for requests from our iOS app
      // see https://github.com/orbiting/app/issues/159
      const { req } = context
      const ua = req.headers['user-agent']
      if (ua && ua.includes('RepublikApp') && (
        ua.includes('iPhone') || ua.includes('iPad') || ua.includes('iPod')
      )) {
        return JSON.parse(
          JSON.stringify(response).replace(/\u2028/g, '')
        )
      }
      return response
    }
  })

  if (RES_KEEPALIVE) {
    server.use('/graphql', require('./keepalive'))
  }

  apolloServer.applyMiddleware({
    app: server,
    cors: false,
    bodyParserConfig: {
      limit: '128mb'
    }
  })
  apolloServer.installSubscriptionHandlers(httpServer)
}
