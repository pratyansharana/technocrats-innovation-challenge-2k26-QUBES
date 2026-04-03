import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { signOut, onAuthStateChanged, User } from 'firebase/auth';
import { auth } from '../config/firebase';
import '../styles/Navbar.css';

const Navbar: React.FC = () => {
  const navigate = useNavigate();
  const [user, setUser] = useState<User | null>(null);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
    });

    return () => unsubscribe();
  }, []);

  const handleLogout = async () => {
    try {
      await signOut(auth);
      navigate('/');
    } catch (error) {
      console.error('Logout error:', error);
    }
  };

  return (
    <nav className="navbar">
      <div className="nav-left">
        <Link to="/" className="nav-link">
          HOME
        </Link>
        {user && (
          <>
            <Link to="/users" className="nav-link">
              USERS
            </Link>
            <Link to="/chat" className="nav-link">
              CHAT
            </Link>
          </>
        )}
      </div>
      <div className="nav-right">
        {!user && (
          <Link to="/login" className="nav-link nav-login">
            LOGIN
          </Link>
        )}
        {user && (
          <button className="nav-logout-btn" onClick={handleLogout}>
            LOGOUT
          </button>
        )}
      </div>
    </nav>
  );
};

export default Navbar;
