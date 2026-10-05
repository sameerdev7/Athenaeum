import { createContext, useContext, useState } from "react";
import { requestToken } from "../api/client";
import { clearMe, loadMe } from "../hooks/useMe";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [token, setToken] = useState(localStorage.getItem("token"));

  async function login(email, password) {
    const data = await requestToken(email, password);
    localStorage.setItem("token", data.access_token);
    setToken(data.access_token);
    await loadMe();
  }

  function logout() {
    localStorage.removeItem("token");
    setToken(null);
    clearMe();
  }

  return (
    <AuthContext.Provider value={{ token, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
