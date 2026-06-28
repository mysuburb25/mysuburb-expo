import React, { createContext, useContext, useState } from 'react';

const AuthContext = createContext({});

const TEST_USER = {
  uid: 'test-user-123',
  email: 'test@mysuburb.com',
  displayName: 'Test User',
};

const TEST_PROFILE = {
  uid: 'test-user-123',
  email: 'test@mysuburb.com',
  displayName: 'Test User',
  suburb: 'Paddington',
  state: 'Queensland',
  isAdmin: false,
  isSuspended: false,
};

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(false);

  const login = async (email, password) => {
    setUser(TEST_USER);
    setProfile(TEST_PROFILE);
  };

  const register = async (email, password, displayName) => {
    setUser({ ...TEST_USER, email, displayName });
    return { user: { uid: 'test-user-123' } };
  };

  const logout = async () => {
    setUser(null);
    setProfile(null);
  };

  const createProfile = async (uid, data) => {
    setProfile({ uid, ...data, isAdmin: false });
  };

  const updateUserProfile = async (data) => {
    setProfile(prev => ({ ...prev, ...data }));
  };

  return (
    <AuthContext.Provider value={{
      user, profile, loading,
      login, register, logout,
      createProfile, updateUserProfile,
      reloadProfile: () => {},
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);