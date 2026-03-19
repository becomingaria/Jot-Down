import {
    CognitoUserPool,
    CognitoUser,
    AuthenticationDetails,
} from "amazon-cognito-identity-js"

const userPoolId = import.meta.env.VITE_COGNITO_USER_POOL_ID
const clientId = import.meta.env.VITE_COGNITO_CLIENT_ID

const poolData = {
    UserPoolId: userPoolId,
    ClientId: clientId,
}

const userPool = new CognitoUserPool(poolData)

export const authService = {
    // Sign in
    signIn(email, password) {
        return new Promise((resolve, reject) => {
            const authenticationDetails = new AuthenticationDetails({
                Username: email,
                Password: password,
            })

            const cognitoUser = new CognitoUser({
                Username: email,
                Pool: userPool,
            })

            cognitoUser.authenticateUser(authenticationDetails, {
                onSuccess: (result) => {
                    resolve({
                        idToken: result.getIdToken().getJwtToken(),
                        accessToken: result.getAccessToken().getJwtToken(),
                        refreshToken: result.getRefreshToken().getToken(),
                        user: {
                            email: result.getIdToken().payload.email,
                            userId: result.getIdToken().payload.sub,
                            groups: (() => {
                                const raw =
                                    result.getIdToken().payload[
                                        "cognito:groups"
                                    ]
                                const list =
                                    typeof raw === "string"
                                        ? raw.split(",")
                                        : raw || []
                                return Array.isArray(list)
                                    ? list.map((g) =>
                                          typeof g === "string"
                                              ? g.toLowerCase()
                                              : g,
                                      )
                                    : []
                            })(),
                        },
                    })
                },
                onFailure: (err) => {
                    reject(err)
                },
                newPasswordRequired: (userAttributes) => {
                    reject({ code: "NewPasswordRequired", userAttributes })
                },
            })
        })
    },

    // Sign out
    signOut() {
        const cognitoUser = userPool.getCurrentUser()
        if (cognitoUser) {
            cognitoUser.signOut()
        }
    },

    // Get current session
    getCurrentSession() {
        return new Promise((resolve, reject) => {
            const cognitoUser = userPool.getCurrentUser()

            if (!cognitoUser) {
                reject("No user found")
                return
            }

            cognitoUser.getSession((err, session) => {
                if (err) {
                    reject(err)
                    return
                }

                if (!session.isValid()) {
                    reject("Session expired")
                    return
                }

                resolve({
                    idToken: session.getIdToken().getJwtToken(),
                    accessToken: session.getAccessToken().getJwtToken(),
                    user: {
                        email: session.getIdToken().payload.email,
                        userId: session.getIdToken().payload.sub,
                        groups: (() => {
                            const raw =
                                session.getIdToken().payload["cognito:groups"]
                            const list =
                                typeof raw === "string"
                                    ? raw.split(",")
                                    : raw || []
                            return Array.isArray(list)
                                ? list.map((g) =>
                                      typeof g === "string"
                                          ? g.toLowerCase()
                                          : g,
                                  )
                                : []
                        })(),
                    },
                })
            })
        })
    },

    // Get current user
    getCurrentUser() {
        return userPool.getCurrentUser()
    },

    // Refresh token
    refreshSession() {
        return new Promise((resolve, reject) => {
            const cognitoUser = userPool.getCurrentUser()

            if (!cognitoUser) {
                reject("No user found")
                return
            }

            cognitoUser.getSession((err, session) => {
                if (err) {
                    reject(err)
                    return
                }

                const refreshToken = session.getRefreshToken()
                cognitoUser.refreshSession(refreshToken, (err, session) => {
                    if (err) {
                        reject(err)
                        return
                    }

                    resolve({
                        idToken: session.getIdToken().getJwtToken(),
                        accessToken: session.getAccessToken().getJwtToken(),
                    })
                })
            })
        })
    },
}
