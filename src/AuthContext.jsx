import React, { createContext, useState, useContext, useEffect } from "react";
import { getApiUrl, API_BASE_URL } from "./utils/api";

export const AuthContext = createContext();

export function AuthProvider({ children }) {
  const [authToken, setAuthToken] = useState(localStorage.getItem("token"));
  const [user, setUser] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem("user"));
    } catch {
      return null;
    }
  });
  const [isAuthenticated, setIsAuthenticated] = useState(!!authToken);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(false);
  }, []);

  const persistSession = (token, userData) => {
    localStorage.setItem("token", token);
    localStorage.setItem("user", JSON.stringify(userData));
    setAuthToken(token);
    setUser(userData);
    setIsAuthenticated(true);
  };

  const login = async (identifier, password) => {
    setLoading(true);
    try {
      const requestBody = {
        name: identifier,
        email: identifier,     // send email
        username: identifier,  // OR username
        password,
      };
      
      const loginUrl = getApiUrl('/api/login');
      console.log("Login request:", { url: loginUrl, body: { ...requestBody, password: '***' } });
      
      const response = await fetch(loginUrl, {
        method: "POST",
        headers: { 
          "Content-Type": "application/json",
          "Accept": "application/json"
        },
        body: JSON.stringify(requestBody),
      });

      console.log("Login response status:", response.status);
      const data = await response.json().catch((err) => {
        console.error("Error parsing response JSON:", err);
        return {};
      });
      console.log("Login response data:", data);

      if (!response.ok || !data.success) {
        // Handle validation errors (422) - extract error message from detail array
        let errorMessage = "Login failed. Please try again.";
        if (data.detail) {
          if (Array.isArray(data.detail)) {
            // FastAPI validation errors come as an array
            errorMessage = data.detail.map(err => err.msg || err.message || JSON.stringify(err)).join(', ');
          } else if (typeof data.detail === 'string') {
            errorMessage = data.detail;
          } else {
            errorMessage = JSON.stringify(data.detail);
          }
        } else if (data.message) {
          errorMessage = data.message;
        }
        
        return {
          success: false,
          error: errorMessage,
        };
      }

      persistSession(data.access_token, data.user);
      return { success: true, user: data.user };
    } catch (error) {
      return {
        success: false,
        error: error.message || "Unable to reach the server. Please try again.",
      };
    } finally {
      setLoading(false);
    }
  };

  const register = async (name, email, password) => {
    setLoading(true);
    try {
      const response = await fetch(getApiUrl('/api/register'), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          email,
          password,
          username: email,
        }),
      });

      const data = await response.json().catch(() => ({}));

      if (!response.ok || !data.success) {
        return {
          success: false,
          error: data.detail || data.message || "Registration failed. Please try again.",
        };
      }

      persistSession(data.access_token, data.user);
      return { success: true, user: data.user };
    } catch (error) {
      return {
        success: false,
        error: error.message || "Unable to reach the server. Please try again.",
      };
    } finally {
      setLoading(false);
    }
  };

  const logout = () => {
    localStorage.removeItem("token");
    localStorage.removeItem("user");
    setAuthToken(null);
    setUser(null);
    setIsAuthenticated(false);
  };

  return (
    <AuthContext.Provider
      value={{
        authToken,
        user,
        isAuthenticated,
        loading,
        login,
        register,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
