import { createContext, useState, useEffect, useContext } from "react"
import { authService } from "../services/auth"
import { apiClient } from "../services/api"

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [idToken, setIdToken] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    // Check for existing session on mount
    authService
      .getCurrentSession()
      .then((session) => {
        setUser(session.user)
        setIdToken(session.idToken)
        apiClient.setIdToken(session.idToken)
        setLoading(false)
      })
      .catch(() => {
        setLoading(false)
      })
  }, [])

  const signIn = async (email, password) => {
    const session = await authService.signIn(email, password)
    setUser(session.user)
    setIdToken(session.idToken)
    apiClient.setIdToken(session.idToken)
    return session
  }

  const signOut = () => {
    authService.signOut()
    setUser(null)
    setIdToken(null)
    apiClient.setIdToken(null)
  }

  const value = {
    user,
    idToken,
    loading,
    signIn,
    signOut,
    isAuthenticated: !!user,
    isAdmin: user?.groups?.includes("admins") || false,
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error("useAuth must be used within AuthProvider")
  }
  return context
}
