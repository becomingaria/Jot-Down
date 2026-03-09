import React, {
    createContext,
    useContext,
    useState,
    useEffect,
    useCallback,
} from "react"
import {
    signIn,
    signOut,
    getCurrentSession,
    completeNewPassword,
} from "../services/auth"

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
    const [user, setUser] = useState(null)
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState(null)
    const [pendingChallenge, setPendingChallenge] = useState(null)

    // Check for existing session on mount
    useEffect(() => {
        getCurrentSession()
            .then((session) => {
                setUser(session.user)
                setLoading(false)
            })
            .catch(() => {
                setUser(null)
                setLoading(false)
            })
    }, [])

    const login = useCallback(async (email, password) => {
        setError(null)
        try {
            const result = await signIn(email, password)

            if (result.challengeName === "NEW_PASSWORD_REQUIRED") {
                setPendingChallenge(result)
                return { challenge: "NEW_PASSWORD_REQUIRED" }
            }

            setUser(result.user)
            return { success: true }
        } catch (err) {
            setError(err.message || "Login failed")
            throw err
        }
    }, [])

    const handleNewPassword = useCallback(
        async (newPassword) => {
            setError(null)
            try {
                if (!pendingChallenge) throw new Error("No pending challenge")
                const result = await completeNewPassword(
                    pendingChallenge.cognitoUser,
                    newPassword,
                )
                setUser(result.user)
                setPendingChallenge(null)
                return { success: true }
            } catch (err) {
                setError(err.message || "Password change failed")
                throw err
            }
        },
        [pendingChallenge],
    )

    const logout = useCallback(() => {
        signOut()
        setUser(null)
        setPendingChallenge(null)
    }, [])

    const getToken = useCallback(async () => {
        try {
            const session = await getCurrentSession()
            return session.idToken
        } catch {
            setUser(null)
            throw new Error("Session expired")
        }
    }, [])

    const value = {
        user,
        loading,
        error,
        pendingChallenge: !!pendingChallenge,
        login,
        logout,
        handleNewPassword,
        getToken,
        isAuthenticated: !!user,
        isAdmin: user?.isAdmin || false,
    }

    return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
    const context = useContext(AuthContext)
    if (!context) throw new Error("useAuth must be used within an AuthProvider")
    return context
}
