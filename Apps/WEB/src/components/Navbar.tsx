import React from 'react';
import { Link } from 'react-router-dom';
import '../styles/Navbar.css';

const Navbar: React.FC = () => {
  return (
    <nav className="navbar">
      <div className="nav-items">
        <Link to="/" className="nav-link">
          HOME
        </Link>
        <Link to="/login" className="nav-link">
          LOGIN
        </Link>
        <Link to="/signup" className="nav-link">
          SIGN UP
        </Link>
      </div>
    </nav>
  );
};

export default Navbar;
