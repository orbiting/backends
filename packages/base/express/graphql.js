const { ApolloServer } = require('apollo-server-express')
const { execute, subscribe, visit } = require('graphql')
const { makeExecutableSchema } = require('graphql-tools')
const { SubscriptionServer } = require('subscriptions-transport-ws')
const cookie = require('cookie')
const cookieParser = require('cookie-parser')
const util = require('util')

const { transformUser } = require('@orbiting/backend-modules-auth')

const { NODE_ENV, WS_KEEPALIVE_INTERVAL } = process.env

module.exports = async (
  server,
  httpServer,
  pgdb,
  graphqlSchema,
  createGraphqlContext = (identity) => identity,
) => {
  const executableSchema = makeExecutableSchema({
    ...graphqlSchema,
    resolverValidationOptions: {
      requireResolversForResolveType: false,
    },
  })

  const createContext = ({ user, ...rest } = {}) => {
    const context = createGraphqlContext({
      ...rest,
      user: global && global.testUser !== undefined ? global.testUser : user,
    })
    // prime User dataloader with me
    if (
      context.user &&
      context.user.id && // global.testUser has no id
      context.loaders &&
      context.loaders.User
    ) {
      context.loaders.User.byId.prime(context.user.id, context.user)
    }
    return context
  }

  const subscriptionServer = SubscriptionServer.create(
    {
      // This is the `schema` we just created.
      schema: executableSchema,
      // These are imported from `graphql`.
      execute,
      subscribe,
      // Providing `onConnect` is the `SubscriptionServer` equivalent to the
      // `context` function in `ApolloServer`. Please [see the docs](https://github.com/apollographql/subscriptions-transport-ws#constructoroptions-socketoptions--socketserver)
      // for more information on this hook.
      async onConnect(connectionParams, webSocket, context) {
        try {
          // apollo-fetch used in tests sends cookie on the connectionParams
          const cookiesRaw =
            NODE_ENV === 'development' && connectionParams.cookies
              ? connectionParams.cookies
              : webSocket.upgradeReq.headers.cookie
          if (!cookiesRaw) {
            return createContext()
          }
          const cookies = cookie.parse(cookiesRaw)
          const authCookie = cookies['connect.sid']
          const sid =
            authCookie &&
            cookieParser.signedCookie(authCookie, process.env.SESSION_SECRET)
          const session = sid && (await pgdb.public.sessions.findOne({ sid }))
          if (
            session &&
            session.sess &&
            session.sess.passport &&
            session.sess.passport.user
          ) {
            const user = await pgdb.public.users.findOne({
              id: session.sess.passport.user,
            })
            return createContext({
              user: transformUser(user),
            })
          }
          return createContext()
        } catch (e) {
          console.error('error in subscriptions.onConnect', e)
          // throwing inside onConnect disconnects the client
          throw new Error('error in subscriptions.onConnect')
        }
      },
      keepAlive: WS_KEEPALIVE_INTERVAL || 1000 * 4,
    },
    {
      // This is the `httpServer` we created in a previous step.
      server: httpServer,
      // This `server` is the instance returned from `new ApolloServer`.
      path: server.graphqlPath,
    },
  )

  const apolloServer = new ApolloServer({
    schema: executableSchema,
    context: ({ req, connection }) =>
      connection ? connection.context : createContext({ user: req.user, req }),
    debug: true,
    introspection: true,
    playground: false, // see ./graphiql.js
    tracing: NODE_ENV === 'development', // -> require('apollo-tracing').plugin()
    formatError: (error) => {
      console.log(
        `graphql error in ${this.operationName} (${JSON.stringify(
          this.variables,
        )}):`,
        util.inspect(error, { depth: null, colors: true, breakLength: 300 }),
      )
      delete error.extensions.exception
      return error
    },
    formatResponse: (response, { context }) => {
      // strip problematic character (\u2028) for requests from our iOS app
      // see https://github.com/orbiting/app/issues/159
      const { req } = context
      const ua = req.headers['user-agent']
      if (
        ua &&
        ua.includes('RepublikApp') &&
        (ua.includes('iPhone') || ua.includes('iPad') || ua.includes('iPod'))
      ) {
        return JSON.parse(JSON.stringify(response).replace(/\u2028/g, ''))
      }
      return response
    },
    validationRules: [(context) => {
      console.log('validationRules', context)
  
      return {
        Field: (node, key, parent, path, ancestors) => {
          console.log('Field', node.alias?.value, node.name?.value, node.selectionSet, path, node)
          return
        }
      }

    }],
    // You can import plugins or define them in-line, as shown:
    plugins: [
      {
        async serverWillStart() {
          return {
            async drainServer() {
              subscriptionServer.close()
            },
          }
        },
      },
      /* {
        async requestDidStart(initialRequestContext) {
          return {
            async executionDidStart(executionRequestContext) {
              visit(executionRequestContext.operation, {
                Field: (node, key, parent, path, ancestors) => {
                  console.log('Field', key, path, node)
                  return
                }
              })

              // console.log(JSON.stringify(executionRequestContext.operation, null, 2))
              return {
                willResolveField({ source, args, context, info }) {
                  const start = process.hrtime.bigint()
                  return (error, result) => {
                    const end = process.hrtime.bigint()
                    console.log(
                      `Field ${info.parentType.name}.${info.fieldName} took ${
                        end - start
                      }ns`,
                    )
                    if (error) {
                      console.log(`It failed with ${error}`)
                    } else {
                      console.log(`It returned ${result}`)
                    }
                  }
                },
              }
            },
          }
        },
      }, */
    ],
  })

  await apolloServer.start()
  apolloServer.applyMiddleware({
    app: server,
    cors: false,
    bodyParserConfig: {
      limit: '128mb',
    },
  })
}
