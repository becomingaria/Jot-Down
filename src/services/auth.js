// Auth service using amazon-cognito-identity-js
import {
    CognitoUserPool,
    CognitoUser,
    AuthenticationDetails,
} from "amazon-cognito-identity-js"

const poolData = {
    UserPoolId: import.meta.env.VITE_COGNITO_USER_POOL_ID || "",
    ClientId: import.meta.env.VITE_COGNITO_CLIENT_ID || "",
}

let userPool = null

function getUserPool() {
    if (!userPool && poolData.UserPoolId && poolData.ClientId) {
        userPool = new CognitoUserPool(poolData)
    }
    return userPool
}

// Sign in with email and password
export function signIn(email, password) {
    return new Promise((resolve, reject) => {
        const pool = getUserPool()
        if (!pool) return reject(new Error("Cognito not configured"))

        const cognitoUser = new CognitoUser({
            Username: email,
            Pool: pool,
        })

        const authDetails = new AuthenticationDetails({
            Username: email,
            Password: password,
        })

        cognitoUser.authenticateUser(authDetails, {
            onSuccess: (session) => {
                resolve({
                    idToken: session.getIdToken().getJwtToken(),
                    accessToken: session.getAccessToken().getJwtToken(),
                    refreshToken: session.getRefreshToken().getToken(),
                    user: parseIdToken(session.getIdToken().getJwtToken()),
                })
            },
            onFailure: (err) => {
                reject(err)
            },
            newPasswordRequired: (userAttributes) => {
                // User needs to set a new password (first login with temp password)
                resolve({
                    challengeName: "NEW_PASSWORD_REQUIRED",
                    cognitoUser,
                    userAttributes,
                })
            },
        })
    })
}

// Complete new password challenge
export function completeNewPassword(cognitoUser, newPassword) {
    return new Promise((resolve, reject) => {
        cognitoUser.completeNewPasswordChallenge(
            newPassword,
            {},
            {
                onSuccess: (session) => {
                    resolve({
                        idToken: session.getIdToken().getJwtToken(),
                        accessToken: session.getAccessToken().getJwtToken(),
                        refreshToken: session.getRefreshToken().getToken(),
                        user: parseIdToken(session.getIdToken().getJwtToken()),
                    })
                },
                onFailure: (err) => {
                    reject(err)
                },
            },
        )
    })
}

// Get current session (auto-refreshes if needed)
export function getCurrentSession() {
    return new Promise((resolve, reject) => {
        const pool = getUserPool()
        if (!pool) return reject(new Error("Cognito not configured"))

        const cognitoUser = pool.getCurrentUser()
        if (!cognitoUser) return reject(new Error("No current user"))

        cognitoUser.getSession((err, session) => {
            if (err) return reject(err)
            if (!session || !session.isValid())
                return reject(new Error("Session invalid"))

            resolve({
                idToken: session.getIdToken().getJwtToken(),
                accessToken: session.getAccessToken().getJwtToken(),
                refreshToken: session.getRefreshToken().getToken(),
                user: parseIdToken(session.getIdToken().getJwtToken()),
            })
        })
    })
}

// Sign out
export function signOut() {
    const pool = getUserPool()
    if (!pool) return

    const cognitoUser = pool.getCurrentUser()
    if (cognitoUser) {
        cognitoUser.signOut()
    }
}

// Parse JWT ID token to extract user info
function parseIdToken(token) {
    try {
        const payload = JSON.parse(atob(token.split(".")[1]))
        return {
            userId: payload.sub,
            email: payload.email,
            groups: payload["cognito:groups"] || [],
            isAdmin: (payload["cognito:groups"] || []).includes("admins"),
        }
    } catch {
        return null
    }
}
